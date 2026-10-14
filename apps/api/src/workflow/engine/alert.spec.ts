import { alert, alertSubject } from './alert';

describe('alert', () => {
  const makeLogger = () => ({ error: jest.fn() });

  describe('alert', () => {
    it('should log the fixed tag, the run and the artifact version as an error', () => {
      const logger = makeLogger();

      alert(logger, 'render.egress', {
        runId: 'run-1',
        artifactId: 'artifact-1',
        version: 2,
      });

      expect(logger.error).toHaveBeenCalledWith(
        '[ALERT render.egress] run=run-1 artifact=artifact-1 version=2',
      );
    });

    it('should append each field as key=value when fields are given', () => {
      const logger = makeLogger();

      alert(
        logger,
        'credit.commit_failed',
        { runId: 'run-1', artifactId: 'artifact-1', version: 1 },
        { credits: 188, error: 'MongoServerError' },
      );

      expect(logger.error).toHaveBeenCalledWith(
        '[ALERT credit.commit_failed] run=run-1 artifact=artifact-1 version=1 credits=188 error=MongoServerError',
      );
    });
  });

  describe('alertSubject', () => {
    it('should name the run and the artifact version from the build input', () => {
      expect(
        alertSubject('run-1', { artifactId: 'artifact-1', version: 3 }),
      ).toEqual({ runId: 'run-1', artifactId: 'artifact-1', version: 3 });
    });
  });
});
