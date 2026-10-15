import { PhaseClock } from './render-phase-clock';

describe('PhaseClock', () => {
  const clockAt = (...times: number[]) => {
    const queue = [...times];
    return () => queue.shift() ?? Number.NaN;
  };

  it('should time each phase from the moment it is entered to the next', () => {
    const clock = new PhaseClock('connect', clockAt(100, 130, 180, 200));

    clock.enter('setup');
    clock.enter('load');

    expect(clock.finish()).toEqual({
      phase: 'load',
      phaseMs: { connect: 30, setup: 50, load: 20 },
    });
  });

  it('should leave out phases that were never entered', () => {
    const clock = new PhaseClock('connect', clockAt(0, 60_000));

    expect(clock.finish()).toEqual({
      phase: 'connect',
      phaseMs: { connect: 60_000 },
    });
  });

  it('should ignore phases entered after it finished', () => {
    const clock = new PhaseClock('connect', clockAt(0, 10, 99));

    const trace = clock.finish();
    clock.enter('setup');

    expect(clock.finish()).toEqual(trace);
    expect(trace).toEqual({ phase: 'connect', phaseMs: { connect: 10 } });
  });
});
