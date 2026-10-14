import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { join } from 'node:path';
import {
  DesignSystem,
  DesignSystemStatus,
} from '../database/schemas/design-system.schema';
import { previewImages, readSeedChecksums } from './design-system-seed';
import {
  DEFAULT_DESIGN_SYSTEM_ID,
  DESIGN_SYSTEM_SEED_DIR,
  PREVIEWS_DIR,
  SUPPORTED_CONTRACT,
  UNLISTED_DESIGN_SYSTEMS,
} from './design-system.constants';

/** A stored Design System Version, as services read it. */
export type DesignSystemRecord = DesignSystem;

export interface DesignSystemSummary {
  id: string;
  version: number;
  name: string;
  summary: string;
  /** API paths of the preview images, in page order. */
  previews: string[];
}

/** An exact Design System Version a document version is pinned to. */
export interface DesignSystemVersionRef {
  id: string;
  version: number;
}

const cacheKey = (id: string, version: number) => `${id}@${version}`;

const previewPath = (id: string, version: number, page: number) =>
  `/api/v1/design-systems/${id}/${version}/previews/${page}.png`;

/**
 * Reads and selection for app-owned Design Systems (document generation spec
 * §3.4). Never writes: `seed:design-systems` is the only writer, and a seed run
 * needs a restart to reach a running process, because nothing here is ever
 * invalidated.
 */
@Injectable()
export class DesignSystemsService implements OnModuleInit {
  private readonly logger = new Logger(DesignSystemsService.name);
  /** `id` → its ACTIVE version, loaded once at boot. */
  private readonly active = new Map<string, DesignSystemRecord>();
  /** Every version read so far, keyed by `(id, version)`. */
  private readonly versions = new Map<string, DesignSystemRecord>();
  /**
   * `id` → its preview file names in page order. Only the ACTIVE version's
   * images exist in the repository, so they belong to that version alone.
   */
  private readonly previews = new Map<string, string[]>();

  constructor(
    @InjectModel(DesignSystem.name)
    private readonly designSystemModel: Model<DesignSystem>,
  ) {}

  /**
   * Boot verifies, never writes: the API and worker refuse to start while any
   * seed file's checksum is missing from the database.
   */
  async onModuleInit(): Promise<void> {
    const seeds = readSeedChecksums(DESIGN_SYSTEM_SEED_DIR);
    const seeded = await this.designSystemModel
      .find(
        { checksum: { $in: seeds.map((seed) => seed.checksum) } },
        { _id: 0, checksum: 1 },
      )
      .lean<Pick<DesignSystem, 'checksum'>[]>()
      .exec();
    const found = new Set(seeded.map((record) => record.checksum));
    const missing = seeds.filter((seed) => !found.has(seed.checksum));
    if (missing.length > 0) {
      throw new Error(
        `Design Systems are not seeded; run \`bun run seed:design-systems\`. Missing: ${missing.map((seed) => seed.path).join(', ')}`,
      );
    }

    const active = await this.designSystemModel
      .find({ status: DesignSystemStatus.ACTIVE }, { _id: 0 })
      .lean<DesignSystemRecord[]>()
      .exec();
    for (const record of active) {
      this.active.set(record.id, record);
      this.versions.set(cacheKey(record.id, record.version), record);
      this.previews.set(
        record.id,
        previewImages(join(DESIGN_SYSTEM_SEED_DIR, record.id)),
      );
    }
    this.logger.log(`Loaded ${active.length} active Design Systems`);
  }

  /** The systems a user may select: ACTIVE and listed, the default first. */
  listActive(): DesignSystemSummary[] {
    return [...this.active.values()]
      .filter((record) => this.isSelectable(record.id))
      .sort(
        (a, b) =>
          Number(b.id === DEFAULT_DESIGN_SYSTEM_ID) -
            Number(a.id === DEFAULT_DESIGN_SYSTEM_ID) ||
          a.id.localeCompare(b.id),
      )
      .map(({ id, version, name, summary }) => ({
        id,
        version,
        name,
        summary,
        previews: (this.previews.get(id) ?? []).map((_, i) =>
          previewPath(id, version, i + 1),
        ),
      }));
  }

  /**
   * The seed image for one-based `page` of a selectable system's ACTIVE
   * version; a `404` for any other version, or a page that does not exist.
   */
  previewFile(id: string, version: number, page: number): string {
    const record = this.active.get(id);
    const file = this.previews.get(id)?.[page - 1];
    if (
      !record ||
      record.version !== version ||
      !this.isSelectable(id) ||
      !Number.isInteger(page) ||
      !file
    ) {
      throw new NotFoundException('Preview not found');
    }
    return join(DESIGN_SYSTEM_SEED_DIR, id, PREVIEWS_DIR, file);
  }

  /** The ACTIVE version of a selectable system; a `400` otherwise. */
  getActive(id: string): DesignSystemRecord {
    const record = this.active.get(id);
    if (!record || !this.isSelectable(id)) {
      throw new BadRequestException(`Design System "${id}" is not available`);
    }
    return record;
  }

  /**
   * An exact pinned version, whatever its status and whether or not it is
   * listed, so an existing pin always resolves.
   */
  async resolve(id: string, version: number): Promise<DesignSystemRecord> {
    const key = cacheKey(id, version);
    const cached = this.versions.get(key);
    if (cached) return cached;

    const record = await this.designSystemModel
      .findOne({ id, version }, { _id: 0 })
      .lean<DesignSystemRecord>()
      .exec();
    if (!record) {
      throw new NotFoundException(`Design System ${id} v${version} not found`);
    }
    this.versions.set(key, record);
    return record;
  }

  /**
   * The pin a Refinement's Attempt carries (spec §6.5), decided in the request
   * path before anything is appended or charged:
   *
   * - with `requested`, that slug's ACTIVE version: an explicit switch, and a
   *   `400` when the slug is not active or is unlisted;
   * - otherwise the base's exact pin, whatever its status, unless this build
   *   cannot consume it (it does not resolve, or its contract is not
   *   `SUPPORTED_CONTRACT`), which is a `409 design_system.unavailable`.
   */
  async pinForRefine(
    base: DesignSystemVersionRef,
    requested?: string,
  ): Promise<DesignSystemVersionRef> {
    if (requested !== undefined) {
      const { id, version } = this.getActive(requested);
      return { id, version };
    }

    let record: DesignSystemRecord | undefined;
    try {
      record = await this.resolve(base.id, base.version);
    } catch (error: unknown) {
      if (!(error instanceof NotFoundException)) throw error;
    }
    if (record?.contract === SUPPORTED_CONTRACT) {
      return { id: base.id, version: base.version };
    }

    // A pin that does not resolve has no record to name it, so it borrows its
    // system's current name, or failing that its slug.
    const name = record?.name ?? this.active.get(base.id)?.name ?? base.id;
    throw new ConflictException({
      statusCode: 409,
      code: 'design_system.unavailable',
      message: `The ${name} design is no longer available. Refine with another design.`,
      designSystemId: base.id,
      designSystemVersion: base.version,
      designSystemName: name,
    });
  }

  private isSelectable(id: string): boolean {
    return this.active.has(id) && !UNLISTED_DESIGN_SYSTEMS.includes(id);
  }
}
