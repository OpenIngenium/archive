'use strict';

// execution collections
const VENUE_GROUP = 'venueGroup';
const VENUE = 'venue';
const NEXT_RUN = 'nextRun';
const ELEMENT = 'element';
const STEP_ORDER = 'stepOrder';
const REVISION = 'revision';
const EXECUTION = 'execution';
const EXECUTION_ID_GEN = 'execution_id_gen';  // Used to generate autoincrementing execution_id
const RUN_RECORD = 'runRecord';

// execution graphs
const EXECUTION_GRAPH = 'execution_graph';
const HISTORY_GRAPH = 'history_graph';

// procedure collections
const PROCEDURE = 'procedure';
const PROCEDURE_ELEMENT = 'procedureElement';
const PROCEDURE_STEP_ORDER = 'procedureStepOrder';
const PROCEDURE_VERSION = 'procedureVersion';
const HAS_VERSION = 'hasVersion';
const PROCEDURE_ID_GEN = 'procedure_id_gen';   // Used to generate autoincrementing procedure_id  
const PROCEDURE_LABEL = 'procedureLabel';

// procedure graph
const PROCEDURE_GRAPH = 'procedure_graph';

// 
const ProcedureModificationStatus = {
  NONE: 'NONE',
  ORIGINAL: 'ORIGINAL',
  MODIFIED: 'MODIFIED',
  MODIFYING: 'MODIFYING',
  MODIFYING_OLD: 'MODIFYING_OLD',  
  DELETED: 'DELETED',
  ADDED: 'ADDED',
};

// 
const ProcedureModificationType = {
  NONE: 'NONE',
  REDLINE: 'REDLINE',
  BLUELINE: 'BLUELINE',
};

const CommentType = {
  COMMENT: 'COMMENT',
  ACTIVITY_REPORT_COMMENT: 'ACTIVITY_REPORT_COMMENT',
  DATA_REVIEW_COMMENT: 'DATA_REVIEW_COMMENT'
}

const CommentStatus = {
  UNRESOLVED: 'UNRESOLVED',
  RESOLVED: 'RESOLVED'
}

module.exports = {
  VENUE_GROUP: VENUE_GROUP,
  VENUE: VENUE,
  NEXT_RUN: NEXT_RUN,
  ELEMENT: ELEMENT,
  STEP_ORDER: STEP_ORDER,
  REVISION: REVISION,
  EXECUTION: EXECUTION,
  EXECUTION_ID_GEN: EXECUTION_ID_GEN,
  RUN_RECORD: RUN_RECORD,
  EXECUTION_GRAPH: EXECUTION_GRAPH,
  HISTORY_GRAPH: HISTORY_GRAPH,
  PROCEDURE: PROCEDURE,
  PROCEDURE_ELEMENT: PROCEDURE_ELEMENT,
  PROCEDURE_STEP_ORDER: PROCEDURE_STEP_ORDER,
  PROCEDURE_VERSION: PROCEDURE_VERSION,
  HAS_VERSION: HAS_VERSION,
  PROCEDURE_ID_GEN: PROCEDURE_ID_GEN,
  PROCEDURE_GRAPH: PROCEDURE_GRAPH,
  PROCEDURE_LABEL: PROCEDURE_LABEL,
  PMS: ProcedureModificationStatus,
  PMT: ProcedureModificationType,
  CommentStatus: CommentStatus
};