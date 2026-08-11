'use strict';

const definitions = require('../../definitions');

describe('definitions', () => {
  test('exposes execution and procedure collection names', () => {
    expect(definitions.VENUE_GROUP).toBe('venueGroup');
    expect(definitions.VENUE).toBe('venue');
    expect(definitions.NEXT_RUN).toBe('nextRun');
    expect(definitions.ELEMENT).toBe('element');
    expect(definitions.STEP_ORDER).toBe('stepOrder');
    expect(definitions.REVISION).toBe('revision');
    expect(definitions.EXECUTION).toBe('execution');
    expect(definitions.EXECUTION_ID_GEN).toBe('execution_id_gen');
    expect(definitions.RUN_RECORD).toBe('runRecord');
    expect(definitions.EXECUTION_GRAPH).toBe('execution_graph');
    expect(definitions.HISTORY_GRAPH).toBe('history_graph');
    expect(definitions.PROCEDURE).toBe('procedure');
    expect(definitions.PROCEDURE_ELEMENT).toBe('procedureElement');
    expect(definitions.PROCEDURE_STEP_ORDER).toBe('procedureStepOrder');
    expect(definitions.PROCEDURE_VERSION).toBe('procedureVersion');
    expect(definitions.HAS_VERSION).toBe('hasVersion');
    expect(definitions.PROCEDURE_ID_GEN).toBe('procedure_id_gen');
    expect(definitions.PROCEDURE_GRAPH).toBe('procedure_graph');
    expect(definitions.PROCEDURE_LABEL).toBe('procedureLabel');
  });

  test('exposes the procedure modification status enum', () => {
    expect(definitions.PMS).toEqual({
      NONE: 'NONE',
      ORIGINAL: 'ORIGINAL',
      MODIFIED: 'MODIFIED',
      MODIFYING: 'MODIFYING',
      MODIFYING_OLD: 'MODIFYING_OLD',
      DELETED: 'DELETED',
      ADDED: 'ADDED'
    });
  });

  test('exposes the procedure modification type enum', () => {
    expect(definitions.PMT).toEqual({
      NONE: 'NONE',
      REDLINE: 'REDLINE',
      BLUELINE: 'BLUELINE'
    });
  });

  test('exposes the comment status enum', () => {
    expect(definitions.CommentStatus).toEqual({
      UNRESOLVED: 'UNRESOLVED',
      RESOLVED: 'RESOLVED'
    });
  });
});
