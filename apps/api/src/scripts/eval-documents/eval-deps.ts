import type { INestApplicationContext } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ArtifactGenerationService } from '../../artifact/artifact-generation.service';
import {
  Artifact,
  BillingInterval,
  Subscription,
  SubscriptionStatus,
  Tier,
  Usage,
  User,
} from '../../database/schemas';
import { DEFAULT_DESIGN_SYSTEM_ID } from '../../design-system/design-system.constants';
import { DesignSystemsService } from '../../design-system/design-systems.service';
import { DocumentMetricsService } from '../../diagnostics/document-metrics.service';
import { FEATURE_KEYS } from '../../feature-gating/feature-gating.constants';
import { getSignedUrl } from '../../s3';
import { WorkflowRunService } from '../../workflow/workflow-run.service';
import {
  ensureEvalAccount,
  topCreditTierId,
  type EvalAccountStore,
} from './eval-account';
import { findCoverKey } from './eval-covers';
import { createEvalGeneration } from './eval-generation';
import type { EvalDeps } from './eval-runner';

/** Cover links outlive the run by a day, enough for the person reviewing them. */
const COVER_URL_TTL_SECONDS = 24 * 60 * 60;

/**
 * Wires the eval to the real services of a booted Nest context. It is glue:
 * every decision lives in the modules it feeds, which the specs cover.
 */
export async function createEvalDeps(
  app: INestApplicationContext,
): Promise<EvalDeps> {
  const model = <T>(name: string) =>
    app.get<Model<T>>(getModelToken(name), { strict: false });
  const users = model<User>(User.name);
  const tiers = model<Tier>(Tier.name);
  const usage = model<Usage>(Usage.name);
  const subscriptions = model<Subscription>(Subscription.name);
  const artifacts = model<Artifact>(Artifact.name);

  const accountStore: EvalAccountStore = {
    findUserIdByEmail: async (email) => {
      const user = await users.findOne({ email }, { _id: 1 }).lean();
      return user?._id.toString();
    },
    findTopCreditTierId: async () => {
      const active = await tiers.find({ isActive: true }, { limits: 1 }).lean();
      return topCreditTierId(
        active.map((tier) => ({
          id: tier._id.toString(),
          credits: tier.limits?.credits ?? 0,
        })),
      );
    },
    // No `clerkId` and no Clerk call: this user cannot sign in.
    createUser: async ({ email, name, tierId }) => {
      const user = await users.create({
        email,
        name,
        tier: new Types.ObjectId(tierId),
      });
      return user._id.toString();
    },
    upsertSubscription: async ({ userId, tierId, periodStart, periodEnd }) => {
      await subscriptions.updateOne(
        { userId: new Types.ObjectId(userId) },
        {
          $set: {
            tierId: new Types.ObjectId(tierId),
            billingInterval: BillingInterval.YEARLY,
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: false,
          },
        },
        { upsert: true },
      );
    },
    deleteCreditUsage: async (userId) => {
      await usage.deleteMany({
        user_id: new Types.ObjectId(userId),
        feature: FEATURE_KEYS.CREDITS,
      });
    },
  };

  const metrics = app.get(DocumentMetricsService, { strict: false });
  return {
    designSystems: app.get(DesignSystemsService, { strict: false }),
    defaultDesignSystemId: DEFAULT_DESIGN_SYSTEM_ID,
    account: await ensureEvalAccount(accountStore),
    generation: createEvalGeneration(
      app.get(ArtifactGenerationService, { strict: false }),
    ),
    runs: app.get(WorkflowRunService, { strict: false }),
    metrics,
    covers: {
      coverUrl: async (artifactId, version) => {
        const artifact = await artifacts
          .findById(artifactId, { versions: 1 })
          .lean();
        const key = findCoverKey(artifact, version);
        return key ? getSignedUrl(key, COVER_URL_TTL_SECONDS) : undefined;
      },
    },
    clock: {
      now: () => Date.now(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    },
    log: (message) => console.log(`${new Date().toISOString()} ${message}`),
  };
}
