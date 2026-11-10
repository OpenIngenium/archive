'use strict';

// Constants

var uuid = require('uuid');
var jwt = require('jsonwebtoken');
var extend = require('extend');
var deepcopy = require('deepcopy');
var util = require('util');
const removeEmptyLines = require("remove-blank-lines");

var base_funcs = require('./base_funcs.js');
var procedure_funcs = require('./procedure_funcs.js');
var definitions = require('../definitions.js');

var config = require('../config.js');

var log = base_funcs.log;
var db = base_funcs.db;
var public_pem = config.public_pem;

var sanitize_internal_attrs = base_funcs.sanitize_internal_attrs
var sanitize_internal_attrs_recursive = base_funcs.sanitize_internal_attrs_recursive
var get_sj_error_message = base_funcs.get_sj_error_message;
var sanitizeElement = base_funcs.sanitizeElement;
var sortChildren = base_funcs.sortChildren;

var venue_group_collection = db.collection(definitions.VENUE_GROUP);
var venue_collection = db.collection(definitions.VENUE);
var procedure_label_collection = db.collection(definitions.PROCEDURE_LABEL);
var element_collection = db.collection(definitions.ELEMENT);
var step_order_collection = db.collection(definitions.STEP_ORDER);
var revision_collection = db.collection(definitions.REVISION);
var execution_collection = db.collection(definitions.EXECUTION);
var execution_id_gen_collection = db.collection(definitions.EXECUTION_ID_GEN);   // Used to generate autoincrementing execution_id
var run_record_collection = db.collection(definitions.RUN_RECORD);

const EXEC_STATUSES = ['IDLE', 'RUNNING', 'PAUSED', 'HALTED', 'SUSPENDED', 'CLOSED', 'IN_REVIEW', 'FINALIZED'];

/**
 * Get as run of an execution. This will return hierarchical json structure of sections
 * and steps. The root can be an execution or an element of an execution
 * @param {String} root_idd - id of execution or element including collection name.
 *                            For example, 'execution/id-123' or 'element/id-432'
*/
var getAsRun = async function(root_idd) {
  return base_funcs.getStructure('EXECUTION', root_idd, false);
}


/**
 * Import selected elements of referenced procedure into procedure section.
 * Any existing elements of the procedure section will be deleted.
 * 
 * @param {String} elem_id - id of procedure or element including collection name.
 *                            For example, 'procedure/id-123' or 'procedureElement/id-432'
 *                            
 * @return {Future} structure of the procedure section after import
 * 
*/
var importProcedureSection = async function(elem_id) {
  log.trace(`importProcedureSection elem_id: ${elem_id}`);
  
  let execution_id = null;

  let reference_procedure_id = null;
  let reference_procedure_title = null;
  let reference_procedure_version = null;
  let reference_elements = null;
  let run_for_score = false;
  
  let elems_copy = [];
  let step_order_edges_copy = [];  

  // map of elem_id of elements selected (from elem_id in procedure to elem_id in execution)
  let selected_elem_id_map = {};
  
  const elem_doc = await base_funcs.getElement('EXECUTION', elem_id);
  const procedure_section = elem_doc;

  let cursor = null;
  let edges = null;
  let res = null;

  let elem_type = elem_doc['elem_type']; 
  if (elem_type != 'PROCEDURE_SECTION') {
    let msg = 'Element is not a procedure section. elem_id: {0} elem_type: {1}'.format(elem_id, elem_type);
    return Promise.reject(msg);
  }

  let execution_user_input = elem_doc['execution_user_input'];  

  if (execution_user_input['callable']) {
    return Promise.reject(`Cannot import. Should be called instead. elem_id: ${elem_id}`);
  }

  if (procedure_section['imported']) {
    return Promise.reject('Cannot import procedure again');
  }

  execution_id = elem_doc['execution_id'];
  

  // elem_doc['run_for_score'] will be true if this is a procedure section 
  // nested in a procedure section with run_for_score.
  run_for_score = base_funcs.isInRunForScore(elem_doc);
  reference_procedure_id = execution_user_input['reference_procedure_id'];
  reference_procedure_title = execution_user_input['reference_procedure_title'];
  reference_procedure_version = execution_user_input['reference_procedure_version'];
  reference_elements = execution_user_input['elements'];

  if (!reference_procedure_id) {
    return Promise.reject(`Cannot import procedure. procedure_id was not provided. elem_id: ${elem_id}`);
  }

  let selected_elems_map = procedure_funcs.getSelectedElementsMap(reference_elements);
  log.trace(`selected_elems_map: ${JSON.stringify(selected_elems_map)}`);
      
  // Get elements from the procedure elements    
  const version_doc = await procedure_funcs.getProcedureVersion(reference_procedure_id, reference_procedure_version);

  res = await base_funcs.getElementsAndEdges('PROCEDURE', version_doc._id)

  let elems = res.elems;
  let step_order_edges = res.step_order_edges;
              
  log.trace(`elems: ${JSON.stringify(elems)}`);
  log.trace(`step_order_edges: ${JSON.stringify(step_order_edges)}`);

  // Delete any child elements starting with immediate children
  try {
    cursor = await step_order_collection.byExample({'_from': procedure_section._id});
    edges = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get element edge from DB: ' + get_sj_error_message(err));
  }

  for (let i=0; i < edges.length; i++) {
    let child_elem_idd = edges[i]._to;
    let child_elem_id = child_elem_idd.split('/')[1]; 
    let msg = `Delete child element. child_elem_id: ${child_elem_id}`; 
    log.trace(msg);                
    // We can force deletion since we already checked for executed elements at the top
    await deleteElement(child_elem_id, true);
  }

  // map from old vertex id to new vertex id
  let vertex_idd_dict = {};
  // procedure section becomes the new root
  vertex_idd_dict[version_doc._id] = 'element/{0}'.format(elem_id);

  // update elems to save them as new vertices
  for (let i=0; i < elems.length; i++) {
    let elem = elems[i];

    let old_key = elem._key;                    
    let old_id = elem._id;
    let new_key = uuid.v4();
    let new_id = 'element/' + new_key;                
    
    // if selected, add it
    if (selected_elems_map[elem._id]) {
      log.trace(`elem is selected: ${elem._id}`);
      elems_copy.push(elem);  
      selected_elem_id_map[elem.elem_id] = new_key;
    } else {
      log.trace(`elem is not selected: ${elem._id}`);
    }
    
    elem._key = new_key;
    elem._id = new_id;
    elem['elem_id'] = new_key;
    elem['execution_id'] = execution_id;
    elem['procedure_section_id'] = elem_id;
    elem['procedure_id'] = reference_procedure_id;  // probably this is not necessary since imported element already has procedure_id
    elem['procedure_title'] = reference_procedure_title;
    // Note that imported elements will have ORIGINAL status regardless
    // of run_for_score flag. 
    elem['procedure_modification_status'] = definitions.PMS.ORIGINAL;
    // elem['procedure_modification_status'] = run_for_score ? definitions.PMS.ORIGINAL : definitions.PMS.NONE;
    elem['run_for_score'] = run_for_score;
    
    // For steps, merge authoring_user_input to execution_user_input
    if (elem.hasOwnProperty('authoring_user_input')) {
      if (elem.hasOwnProperty('execution_user_input')) {
        // It is unfortunate that we need to introduce step specific logic here.
        // custom script has generic specs of inputs as placeholder for execution_user_input.
        // they must be excluded.
        let updated = false;
        if (elem.step_type === 'CUSTOM_SCRIPT') {
          delete elem.execution_user_input.inputs;
          delete elem.execution_user_input.entries;
          delete elem.execution_user_input.outputs;
          delete elem.execution_user_input.output_array;
        } else if (elem.step_type === 'MANUAL_EIP') {
          // See ING-3940 and ING-3941
          // One more case where we use a step specific logic.
          // Set measured_unit as the same as unit and initialze actual_value
          const authoring_user_input = deepcopy(elem['authoring_user_input']);
          for (const entry of authoring_user_input.entries) {
            entry.measured_unit = entry.unit;
            entry.actual_value = '';
          }
          elem['execution_user_input'] = extend(true, {}, elem['execution_user_input'], authoring_user_input);
          updated = true;
        } else if (elem.step_type === 'GDS_MANUAL') {
          // One more case where we use a step specific logic.
          // Set session_id that is not set in authoring user input
          const authoring_user_input = deepcopy(elem['authoring_user_input']);
          for (const entry of authoring_user_input.entries) {
            entry.session_id = 0;
          }
          elem['execution_user_input'] = extend(true, {}, elem['execution_user_input'], authoring_user_input);
          updated = true;
        }

        if (!updated) {
          elem['execution_user_input'] = extend(true, {}, elem['execution_user_input'], elem['authoring_user_input']);
        }
      } else {
        elem['execution_user_input'] = extend(true, {}, elem['authoring_user_input']);
      }
    }
    // set the run_for_score flag for procedure section
    if (elem['elem_type'] == 'PROCEDURE_SECTION') {
      elem['execution_user_input']['run_for_score'] = run_for_score;
    }
    
    // Reset conversations. Do not carry over comments from procedure to execution.
    elem['conversations'] = [];
    
    // Remove interval attribute of arango
    delete elem['_version'];
    
    // Since elements are copied from element collection to procedureElement collection,
    // delete _id. They will be regenerated by db. 
    delete elem['_id'];                
    
    log.trace(`Add vertex id to map. old_id: ${old_id} new_id: ${new_id}`);
    vertex_idd_dict[old_id] = new_id;
  }            
              
  // update step order edges to save them as new edges
  for (let i=0; i < step_order_edges.length; i++) {
    let edge = step_order_edges[i];
    
    // if selected, add it. Need to do this before updating "_to"
    if (selected_elems_map[edge._to]) {
      log.trace(`Edge is selected: ${JSON.stringify(edge)}`);
      step_order_edges_copy.push(edge);  
    } else {
      log.trace(`Edge is not selected: ${JSON.stringify(edge)}`);
    }  
    
    // delete _key and _id so that new keys are generated automatically by db.
    delete edge['_key'];
    delete edge['_id'];

    let from_old = edge._from;
    if (vertex_idd_dict[from_old]) {
      let from_new = vertex_idd_dict[from_old];
      edge._from = from_new;
    } else {
      log.warning(`New vertex was not found. from_old: ${from_old}`);
    }
    
    let to_old = edge._to;
    if (vertex_idd_dict[to_old]) {
      let to_new = vertex_idd_dict[to_old];
      edge._to = to_new;
    } else {
      log.warning(`New vertex was not found. to_old: ${to_old}`);
    }
  }
  
  // set idx using zero based numbers that increment by one
  // this handles cases where a subset of procedure elements are imported.
  base_funcs.update_idx_for_edges(step_order_edges_copy);
  
  try {
    await element_collection.update(elem_id, {'imported': true});
  } catch (err) {
    return Promise.reject('Failed to update imported state in DB: ' + get_sj_error_message(err));
  }
        
  // Note: res is not used
  if (elems_copy.length > 0) {
    // update elem_id references in VI Status Steps
    elems_copy.forEach(function (elem_copy) {
      if (elem_copy.elem_type == 'STEP' && elem_copy.step_type == 'VERIFICATION_ITEM_STATUS') {
        if (elem_copy.execution_user_input && elem_copy.execution_user_input.steps) {
          log.trace(`selected_elem_id_map: ${JSON.stringify(selected_elem_id_map)}`);
          elem_copy.execution_user_input.steps.forEach(function (step) {
            log.trace(`step.elem_id: ${step.elem_id}`);
            if (selected_elem_id_map.hasOwnProperty(step.elem_id)) {
              step['elem_id'] = selected_elem_id_map[step.elem_id];
            } else {
              // the step was not selected for import
              step['elem_id'] = '';
            }
          });
        } 
      }
    });

    log.trace('Now copy elems');

    try {
      await element_collection.import(elems_copy, {'type': 'documents'});
    } catch (err) {
      return Promise.reject('Failed to import copied elements to DB: ' + get_sj_error_message(err));
    }

    let msg = `Elements were copied. count: ${elems_copy.length} elem_id: ${elem_id} reference_procedure_id: ${reference_procedure_id} reference_procedure_version: ${reference_procedure_version}`
    log.trace(msg);      
  }
      
  if (step_order_edges_copy.length > 0) {
    log.trace('Now copy step order edges');

    try {
      await step_order_collection.import(step_order_edges_copy, {'type': 'documents'});
    } catch (err) {
      return Promise.reject('Failed to import copied element edges to DB: ' + get_sj_error_message(err));
    }

    let msg = 'Step orders were copied. count: {0} elem_id: {1} reference_procedure_id: {2} reference_procedure_version: {3}'.format(
      step_order_edges_copy.length, elem_id, reference_procedure_id, reference_procedure_version);
    log.trace(msg);     
  }
  
  let elem_idd = 'element/{0}'.format(elem_id);
  log.trace(`importProcedureSection completed for elem_idd: ${elem_idd}`);
  return base_funcs.getElements('EXECUTION', elem_idd, null, null, null);   
}

/**
 * Get chronological record of executions of steps for a given execution
 *
 * @param {String} execution_idd - id of execution including collection name.
 *                            For example, 'execution/id-123'
*/
var getStepExecutionHistory = async function (execution_idd) {
  const elems = [];
  const elements = await base_funcs.getElements('EXECUTION', execution_idd, null, null, null);

  for (const element of elements) {
    if (element.run_records) {
      for (const run_record of element.run_records) {
        // old element may not have 'executable' field
        if (run_record.executable === 'EXECUTED' || (!run_record.hasOwnProperty('executable'))) {
          delete run_record.parent_id;
          elems.push(run_record);
        }
      }
      element.run_records = [];
    }
    // old element may not have 'executable' field
    if (element.executable === 'EXECUTED' || (!element.hasOwnProperty('executable'))) {
      if (element.execution && element.execution.meta_data && element.execution.meta_data.time_started) {
        delete element.parent_id;
        elems.push(element);
      }
    }
  }

  elems.sort(function(elem1, elem2) {
    const time_started_1 = (elem1.execution && elem1.execution.meta_data && elem1.execution.meta_data.time_started) ? elem1.execution.meta_data.time_started : '';
    const time_started_2 = (elem2.execution && elem2.execution.meta_data && elem2.execution.meta_data.time_started) ? elem2.execution.meta_data.time_started : '';

    if (time_started_1 > time_started_2) {
      return 1;
    } else if (time_started_1 < time_started_2) {
      return -1;
    } else {
      return 0;
    }
  });
  return elems;
}

/**
 * Set user provided manual input for a step
 *
 * @param {String} step_id - unique id of step
 * @param {Object} input - user provided input. The format depends on the type of step.
*/
var setStepInput = async function (step_id, input) {
  var result_id = null;
  var idx = 0;
  // check if the step exists
  const elem = await getElement(step_id);

  // current result with no output
  try {
    await element_collection.update(step_id, {'execution_user_input': input})
  } catch (err) {
    return Promise.reject('Failed to update element in DB: ' + get_sj_error_message(err));
  }

  return Promise.resolve(null);
}

function _get_step_status(step, default_value) {
  return (step.hasOwnProperty('execution') && 
    step.execution.hasOwnProperty('meta_data') && 
    step.execution.meta_data.hasOwnProperty('status')) ? step.execution.meta_data.status : default_value;
}

function _get_step_execution_meta_data_status(step_execution, default_value) {
  return (step_execution.hasOwnProperty('meta_data') && 
    step_execution.meta_data.hasOwnProperty('status')) ? step_execution.meta_data.status : default_value;  
}

/**
 * Set results of step execution
 *
 * @param {String} step_id - unique id of step
 * @param {Object} output - results of step execution. The format depends on the type of step.
*/
var setStepOutput = async function (step_id, output) {
  // log.debug(`setStepOutput. step_id: ${step_id} output: ${JSON.stringify(output)}`);

  let step_idd = 'element/' + step_id;
  let execution_id = null;
  let execution = null;

  // check if the step exists
  const elem = await getElement(step_id);
  const step = elem;
  const rev_current = elem._rev;

  execution_id = elem['execution_id'];
  execution = await getExecution(execution_id);

  let step_status_current = _get_step_status(step, 'NONE');
  let step_status_new = _get_step_execution_meta_data_status(output, null);
  let executed_current = ['PASS', 'FAIL', 'ERROR', 'OVERRIDE_PASS', 'OVERRIDE_FAIL'].includes(step_status_current);
  let executed_new = ['PASS', 'FAIL', 'ERROR'].includes(step_status_new);

  if (executed_current) {
    // If the step has been completed, do not update results again.
    // This is a protection against a race condition in Core. Core will start running a step through Execution Service 
    // in async mode, and the Execution Service may already completed the step before Core returns an API reponse
    // for the runExecution call, which may cause reverting the step to RUNNING state.   
    log.warning(`Step has been completed. Do not update results again. elem_id: ${step_id}`);
  } else {
    let step_to_update = {'execution': output};

    if (executed_new === true) {
      let max_trials = 3;
      for (let i=0; i < max_trials; i++) {
        try {
          step_to_update['executed'] = true;
          // log.debug(`Set final result to step. step_id: ${step_id} step_to_update: ${JSON.stringify(step_to_update)}`);
          await element_collection.update(step_id, step_to_update);
          break;
        } catch (err) {
          if (i < max_trials) {
            log.warning(`Failed to update final result of step in DB. trial: ${i} error: util.inspect(err)`);
          } else {
            return Promise.reject(`Failed to update final result of step in DB: ${get_sj_error_message(err)}`);
          }
        }
      }
    } else {
      // Set intermediate result only if the document has not been changed.
      // This is a protection against a race condition.  
      try {
        // log.debug(`Set intermediate result to step. step_id: ${step_id} step_to_update: ${JSON.stringify(step_to_update)}`);
        await element_collection.update(step_id, step_to_update, {'rev': rev_current});
      } catch (err) {
        log.warning(`Failed to update intermediate result of step in DB: ${util.inspect(err)}`);
      }
    }
  }
  
  return getStep(step_id);
}


/**
 * Create a copy of the step to run it again
 *
 * @param {String} step_id - unique id of step
 * @param {Object} output - step with run records
*/
var createNewRun = async function (step_id, output) {
  let step_idd = 'element/' + step_id;
  let record = null;
  let record_elem_id = null;
  let record_elem_idd = null;
  let execution_id = null;

  // check if the step exists
  const elem = await getElement(step_id);
  const step = elem;

  let cursor = null;
  let edges = null;

  if (!step['executed']) {
    return Promise.reject('Cannot rerun a step that has not been executed');
  }

  execution_id = elem['execution_id'];

  record_elem_id = uuid.v4();    
  // assign new elem_id to the record. elem_id should be the same as "key".
  record = extend(true, {}, elem, {'elem_id': record_elem_id});
  record['run_records'] = [];
  record = sanitize_internal_attrs_recursive(record);
  record['_key'] = record_elem_id;
  record_elem_idd = 'element/' + record_elem_id;

  try {
    await element_collection.save(record);
  } catch (err) {
    return Promise.reject('Failed to save run record in DB: ' + get_sj_error_message(err));
  }

  // remove result of the current step
  step['execution']['meta_data']=deepcopy(base_funcs.execution_meta_data_template);
  // reset results using specification. We need to use specification
  // to handle enum values correctly.
  if (step['specification'].hasOwnProperty('results')) {
    step['execution']['results'] = deepcopy(step['specification']['results']);
  } else {
    log.warning('createNewRun: Did not reset the results because step specification did not have results.');
  }

  step['executed'] = false;

  try {
    await element_collection.replace(step_id, step);
  } catch (err) {
    return Promise.reject('Failed to replace the step in DB: ' + get_sj_error_message(err));
  }

  try {
    cursor = await run_record_collection.byExample({'_from': step_idd});
    edges = await cursor.all();
    await run_record_collection.save({'_from': step_idd, '_to': record_elem_idd, 'idx': edges.length})
  } catch (err) {
    return Promise.reject('Failed to save run record edges in DB: ' + get_sj_error_message(err));
  }

  // this is used to get run_records of the step
  const step_elem = await base_funcs.getStructure('EXECUTION', step_idd, false);

  const step_elem_sanitized = sanitize_internal_attrs_recursive(step_elem);
  return Promise.resolve(step_elem_sanitized);
}

/**
 * Get the content of step including specification and results if any
 * @param {String} elem_id - unique id of step
 * @return {Promise}
*/
async function getStep(elem_id) {
  return base_funcs.getElementSanitized('EXECUTION', elem_id);
}


/**
 * Get the current logging status such as logging level
 *
 * @return {Object} - logging level (e.g., INFO, DEBUG, etc) and etc.
*/
function getLogging() {
  return {'level': log.level.toUpperCase()};
}

/**
 * Update the logging status
 *
 * @logging_info {Object} - logging level (e.g., INFO, DEBUG, etc), etc.
*/
function updateLogging(logging_info) {
  log.level = logging_info['level'].toLowerCase();
}

/**
 * Create a new execution
 * @param {Object} execution_input - information about the new execution
 * @return {Promise} - Promise that may be fulfilled with the new execution
 */
var createExecution = async function (execution_input) {
  let venue_id = execution_input['venue_id'] || '';
  let venue = null;
  let next_execution_id = null;
  let res = null;

  if (venue_id == '') {
    return Promise.reject('Venue ID was not specified');
  }

  let venues = null;
  try {
    venues = await venue_collection.lookupByKeys([venue_id]);
  } catch (err) {
    return Promise.reject('Failed to get venue from DB: ' + get_sj_error_message(err));
  }
  
  if (venues.length < 1) {
    return Promise.reject('Venue was not found: ' + venue_id);
  } else if (venues.length > 1) {
    return Promise.reject('More than one venue was found: ' + venue_id);
  }
  
  venue = venues[0];
  let venue_status = venue['venue_status']['status']
  if (venue_status == 'IN_USE' || venue_status == 'DOWN') {
    return Promise.reject('Selected venue is not available. status: {0}'.format(venue_status));
  }

  try {
    res = await execution_id_gen_collection.save({}, {'returnNew': true});
  } catch (err) {
    return Promise.reject('Failed to update execution id generator in DB: ' + get_sj_error_message(err));
  }

  next_execution_id = res['new']['_key'];

  let executionEmpty = {
    'execution_id': '',
    'parent_execution_id': '',
    'parent_procedure_section_id': '',
    'time_started': new Date(),
    'time_completed': '',
    'status': 'IDLE',
    'mode': 'MANUAL',
    'delay': 0,
    'pause_conditions': {
      'on_fail': true,
      'on_error': true,
      'on_section_end': false,
      'on_procedure_end': false,
      'on_manual_input': true,
      'on_command': false,
      'on_break_point': true         
    },
    'boundary_elem_id': '',
    'url': '',
    'test_conductors': [],
    'participants': [],
    'redline_approvers': [],
    'observers': [],
    'version': config.version,
    'api_version': config.api_version,
    'flight_dictionary_version': '',
    'sse_dictionary_version': '',
    'description': '',
    'activity_report_content': '',
    'data_review_content': '',
    'transitions': [],
    'files': [],
    'run_for_score': false,
    'current_step_id': '',
    'current_step_number': '',
    'current_step_title': '',
    'current_procedure_id': '',
    'current_procedure_title': '',
    'used_procedures': [],
    'comment_conversations_count': 0,
    'unresolved_comment_conversations_count': 0,
    'ar_conversations_count': 0,
    'unresolved_ar_conversations_count': 0,
    'dr_conversations_count': 0,
    'unresolved_dr_conversations_count': 0,
    'conversations_count': 0,
    'unresolved_conversations_count': 0,
  }

  executionEmpty['venue_name'] = venue['name'];
  let execution = extend(true, {}, executionEmpty, execution_input);

  let execution_id = config.execution_id_prefix + next_execution_id;
  execution['_key'] = execution_id;
  execution['execution_id'] = execution_id;

  try {
    await execution_collection.save(execution);
  } catch (err) {
    return Promise.reject('Failed to save execution in DB: ' + get_sj_error_message(err));
  }

  return Promise.resolve(execution);
}

/**
 * Delete an execution
 *
 * @param {String} execution_id - id of execution to be deleted
 * @return {Promise}
 */
var deleteExecution = async function (execution_id) {
  var target_id = 'execution/' + execution_id;
  let docs = null;
  let cursor = null;
  let res = null;

  try {
    docs = await execution_collection.lookupByKeys([execution_id]);
  } catch (err) {
    return Promise.reject('Failed to find execution in DB: ' + get_sj_error_message(err));
  }

  if (docs.length == 0) {
    return Promise.reject('Execution was not found. execution_id: {0}'.format(execution_id));
  } else if (docs.length > 1) {
    return Promise.reject('More than one execution was not found. execution_id: {0}'.format(execution_id));
  }

  try {
    cursor = await db.query(
      `
      FOR vertex, edge
        IN 1..10000
        OUTBOUND '${target_id}'
        GRAPH 'execution_graph'
        OPTIONS {bfs: true}
        RETURN {v_id: vertex._id, v_key: vertex._key, e_id: edge._id, e_key: edge._key}
      `,
      {},
      {count: true}
    );
    res = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get elements graph from DB: ' + get_sj_error_message(err));
  }

  // vertex keys
  let elem_keys = [];

  // edge keys
  let step_order_keys = [];
  let run_record_keys = [];

  for (let entry of res) {
    if (entry.v_id.startsWith('element/')) {
      elem_keys.push(entry.v_key);
    } else {
      log.warning(`Unrecognized element type: ${entry.v_id}`);
    }

    if (entry.e_id.startsWith('stepOrder/')) {
      step_order_keys.push(entry.e_key);
    } else if (entry.e_id.startsWith('runRecord/')) {
      run_record_keys.push(entry.e_key);
    } else {
      log.warning(`Unrecognized edge type: ${entry.e_id}`);
    }
  }

  try {
    await execution_collection.removeByKeys([execution_id]);
    await element_collection.removeByKeys(elem_keys);
    await step_order_collection.removeByKeys(step_order_keys);
    await run_record_collection.removeByKeys(run_record_keys);
  } catch (err) {
    return Promise.reject('Failed to remove elements data from DB: ' + get_sj_error_message(err));
  }

  return Promise.resolve(null);
}

/**
 * Update metadata of an execution
 *
 * @param {String} execution_id - id of execution
 * @param {Object} execution_meta_data - meta data of execution
 * @return {Promise}
 */
var updateExecution = async function (execution_id, execution_meta_data) {
  let current_step = null;

  if (execution_meta_data.hasOwnProperty('current_step_id')) {
    if (execution_meta_data.current_step_id) {
      current_step = await getElement(execution_meta_data.current_step_id);
      if (current_step) {
        execution_meta_data['current_step_title'] = current_step['title'];
        execution_meta_data['current_step_number'] = current_step['number'];
        execution_meta_data['current_procedure_id'] = current_step['procedure_id'];
        execution_meta_data['current_procedure_title'] = current_step['procedure_title'];
      }
    } else {
      execution_meta_data['current_step_title'] = '';
      execution_meta_data['current_step_number'] = '';
      execution_meta_data['current_procedure_id'] = '';
      execution_meta_data['current_procedure_title'] = '';     
    }
  }
  try {
    await execution_collection.update(execution_id, execution_meta_data); 
  } catch (err) {
    return Promise.reject('Failed to update execution in DB: ' + get_sj_error_message(err));
  }

  return getExecutionFull(execution_id);
}


var _isOpenStatus = function(status) {
  const closed_index = EXEC_STATUSES.indexOf('CLOSED');
  const index = EXEC_STATUSES.indexOf(status);

  return (index > -1) && (index < closed_index);
}

/**
 * Update metadata of an execution
 *
 * @param {String} execution_id - id of execution
 * @param {Object} execution_status - new execution status
 * @param {String} user_name - user name
 * @return {Promise} update execution info
 */
var updateExecutionStatus = async function (execution_id, execution_status, user_name) {
  const execution = await getExecution(execution_id);
  const from_status = execution.status;
  const to_status = execution_status.status;
  const comment = execution_status.comment || '';
  const now = new Date();

  const transition = {
    'time_updated': now,
    'user_name': user_name,
    'from_status': from_status,
    'to_status': to_status,
    'comment': comment
  };

  const transitions = [];
  if (Array.isArray(execution['transitions'])) {
    transitions.push(...execution['transitions']);
  }
  
  transitions.push(transition);

  let execution_input = {
    'transitions': transitions,
    'status': to_status
  };
  
  if (_isOpenStatus(from_status) && to_status == 'CLOSED') {
    execution_input['time_completed'] = now;
    // clear status info of current step   
    execution_input['current_step_id'] = '';
    execution_input['current_step_number'] = '';
    execution_input['current_step_title'] = '';
    execution_input['current_procedure_id'] = '';
    execution_input['current_procedure_title'] = '';
  }
  
  let execution_updated = null;
  try {
    const res = await execution_collection.update(execution_id, execution_input, {'returnNew': true});
    execution_updated = base_funcs.sanitize_internal_attrs(res.new);
  } catch (err) {
    return Promise.reject('Failed to update execution in DB: ' + get_sj_error_message(err));
  }

  if (execution_status.status === 'CLOSED' || execution_status.status === 'SUSPENDED') {
    execution_updated = await updateUsedProcedures(execution_id);
  }
  return Promise.resolve(execution_updated);
}

/**
 * return true if the element is a redlined element that came from a procedure.
 * @param {ProcedureElement} elem 
 */
function isOriginalAndRedlined(elem) {
  if (elem) {
    return elem.procedure_modification_status == 'MODIFIED' || 
    elem.procedure_modification_status == 'MODIFYING_OLD' ||
    elem.procedure_modification_status == 'DELETED';    
  }
  return false;
}

/**
 * Get the step next to the current step
 *
 * @param {String} execution_id - id of execution
 * @param {String} elem_id - id of reference element
 * @param {boolean} executable - true if to consider only executable element (step or procedure section)
 * @return {Promise} promise that may be fulfilled with a step
 */
var getNextElement = async function (execution_id, elem_id, executable) {
  log.debug(`execution_id: ${execution_id} elem_id: ${elem_id} executable: ${executable}`);
  
  let execution_idd = 'execution/{0}'.format(execution_id);
  log.debug(`execution_idd: ${execution_idd}`);
  const elements = await base_funcs.getSimpleElements('EXECUTION', execution_idd);
    
  log.debug(`elements.length: ${elements.length}`);

  let next_index = -1;
  for (let i=0; i < elements.length; i++) {
    let element = elements[i];
    if (element.elem_id == elem_id) {
      if (i < (elements.length-1)) {
        next_index = i+1;
      }
      break;
    }
  }
  if (next_index == -1) {
    return Promise.resolve(null);  
  } 
  
  for (let i=next_index; i < elements.length; i++) {
    let element_to_return = null;
    let element = elements[i];
    if (executable) {
      if (element.elem_type == 'STEP' && (element.executable == 'EXECUTED' || element.executable == 'COMPUTED')) {
        element_to_return = element;
      } else if (element.elem_type == 'PROCEDURE_SECTION') {
        element_to_return = element;
      }            
    } else {
      element_to_return = element;
    }
    
    if (element_to_return !== null) {
      if (isOriginalAndRedlined(element_to_return)) {
        // skip redlined element from procedure and continue
      } else {
        return await getElement(element_to_return.elem_id);        
      }
    }
  }
  return Promise.resolve(null);
}


/**
 * set the execution bound for auto execution
 *
 * @param {String} execution_id - id of execution
 * @param {String} elem_id - id of the element for which execution starts
 * @return {Promise} promise that may be fulfilled with the execution meta data
 */
var setExecutionBoundary = async function (execution_id, elem_id) {
  log.debug(`setExecutionBoundary execution_id: ${execution_id} elem_id: ${elem_id}`);

  let execution = null;
  let boundary_elem_id = '';

  try {
    execution = await getExecution(execution_id);
    log.trace(`setExecutionBoundary execution ${JSON.stringify(execution)}`);
  } catch (error) {
    log.warning(`setExecutionBoundary execution is not found. execution_id: ${execution_id}`);
    return null;
  }
  
  if (elem_id) {
    if (execution.mode == 'AUTO') {
      let scope = '';
      if (execution.pause_conditions) {
        // on_section_end takes precedence over on_procedure_end
        if (execution.pause_conditions.on_section_end) {
          scope = 'SECTION';
        } else if (execution.pause_conditions.on_procedure_end) {
          scope = 'PROCEDURE';
        }
      }
      log.trace(`setExecutionBoundary. scope: ${scope}`);
    
      let elements = await base_funcs.getElements('EXECUTION', `execution/${execution_id}`, null, null, null);
    
      log.trace(`setExecutionBoundary. elements.length: ${elements.length}`);
    
      let element_map = {};
      let parent_id_map = {};
      let start_elem = null;
      let start_elem_idx = -1;
    
      if (elements) {
        for (let i=0; i < elements.length; i++) {
          if (elements[i].elem_id == elem_id) {
            start_elem = elements[i];
            start_elem_idx = i;
          }
          element_map[elements[i].elem_id] = elements[i];
          parent_id_map[elements[i].elem_id] = elements[i].parent_id; 
        }
      }
    
      if (start_elem === null) {
        log.warning(`setExecutionBoundary start_elem was not found. elem_id: ${elem_id}`);
        return null;
      }
    
      // top element in the search of the boundary
      let top_elem_id = '';
      if (scope == 'SECTION') {
        if (start_elem.elem_type == 'STEP' || start_elem.elem_type == 'PARAGRAPH') {
          top_elem_id = start_elem.parent_id;
        } else if (start_elem.elem_type == 'SECTION' || start_elem.elem_type == 'PROCEDURE_SECTION') {
          top_elem_id = start_elem.elem_id;
        } else {
          log.warning(`setExecutionBoundary. Unexpected elem_type: ${start_elem.elem_type}`);
        }
      } else if (scope == 'PROCEDURE') {
        if (start_elem.elem_type == 'PROCEDURE_SECTION') {
          top_elem_id = start_elem.elem_id;
        } else {
          if (start_elem.procedure_id) {
            for (let current_elem=start_elem; ; ) {
              if (current_elem.elem_type == 'PROCEDURE_SECTION') {
                top_elem_id = current_elem.elem_id;
                break;
              } else {
                if (current_elem.parent_id) {
                  current_elem = element_map[current_elem.parent_id];
                } else {
                  break;
                }
              }
            }
          } else {
            // If the current element does not belong to a procedure, stop at the start of the next procedure.
            // In this case, we do not need to use top_elem_id. Instead, find out boundary_elem_id by finding the next procedure section if any.
            for (let i=start_elem_idx+1; i < elements.length; i++) {
              if (elements[i].elem_type == 'PROCEDURE_SECTION') {
                boundary_elem_id = elements[i].elem_id;
                break;
              }
            }
          }
        }
      }
    
      log.trace(`setExecutionBoundary. top_elem_id: ${top_elem_id}`);
    
      if (boundary_elem_id) {
        // do nothing if boundary_elem_id has been already identified
      } else {
        for (let i=start_elem_idx+1; i < elements.length; i++) {
          let parent_ids = [];
          for (let current_elem = elements[i]; ;) {
            if (current_elem.parent_id) {
              parent_ids.push(current_elem.parent_id);
              current_elem = element_map[current_elem.parent_id];
            } else {
              break;
            }
          }
    
          log.trace(`setExecutionBoundary. parent_ids: ${parent_ids}`);
    
          if (top_elem_id && (!parent_ids.includes(top_elem_id))) {
            boundary_elem_id = elements[i].elem_id;
            break;
          }
        }
      }
    }
  }


  log.trace(`setExecutionBoundary. execution.mode: ${execution.mode} boundary_elem_id: ${boundary_elem_id}`);

  return updateExecution(execution_id, {'boundary_elem_id': boundary_elem_id});
}

/**
 * update the list of used procedures and versions in an execution
 * 
 * @param {String} execution_id id of execution
 */
var updateUsedProcedures = async function (execution_id) {
  let elem_type = 'PROCEDURE_SECTION';

  let execution_idd = `execution/${execution_id}`;
  const procedure_sections = await base_funcs.getElements('EXECUTION', execution_idd, elem_type, null, null);
  
  let used_procedures = [];
  let run_for_score = false;     // flag for the execution

  for (let i=0; i < procedure_sections.length; i++) {
    let procedure_section = procedure_sections[i];
    if (procedure_section.imported) {
      if (procedure_section.execution_user_input) {
        if (procedure_section.execution_user_input.run_for_score) {
          run_for_score = true;
        }
        const reference_procedure_id = procedure_section.execution_user_input.reference_procedure_id || '';
        const reference_procedure_title = procedure_section.execution_user_input.reference_procedure_title || '';
        const reference_procedure_version = procedure_section.execution_user_input.reference_procedure_version || 0;
        const reference_procedure_institutional_id = procedure_section.execution_user_input.reference_procedure_institutional_id || '';
        const reference_procedure_institutional_release_id = procedure_section.execution_user_input.reference_procedure_institutional_release_id || '';
  
        if (reference_procedure_id && 
            (reference_procedure_version === 0 || reference_procedure_version >= 1)) {    // splitted conditions to handle null value
          used_procedures.push({
            'procedure_id': reference_procedure_id,
            'title': reference_procedure_title,
            'version': reference_procedure_version,
            'institutional_id': reference_procedure_institutional_id,
            'institutional_release_id': reference_procedure_institutional_release_id,
            'run_for_score': procedure_section.execution_user_input.run_for_score
          });
        }
      }
    }
  }

  let execution_info = await updateExecution(execution_id, {'run_for_score': run_for_score, 'used_procedures': used_procedures});

  return execution_info;
}

/**
 * get execution meta data
 *
 * @param {String} execution_id - id of execution
 * @return {Promise} - Promise that may be fulfilled with the execution meta data
 */
var getExecution = async function (execution_id) {
  let docs = null;
  try {
    docs = await execution_collection.lookupByKeys([execution_id]);
  } catch (err) {
    return Promise.reject('Failed to get execution from DB: ' + get_sj_error_message(err));
  }

  if (docs.length > 1) {
    return Promise.reject('More than one execution was found for execution_id: {0}'.format(execution_id));
  }

  if (docs.length == 0) {
    return Promise.reject('No execution was found for execution_id: {0}'.format(execution_id));
  } else {
    return Promise.resolve(base_funcs.sanitize_internal_attrs(docs[0]));
  }
}

/**
 * get execution meta data with step execution counts
 *
 * @param {String} execution_id - id of execution
 * @return {Promise} - Promise that may be fulfilled with the execution meta data
 */
var getExecutionFull = async function (execution_id) {
  const execution = await getExecution(execution_id);
  
  let execution_idd = `execution/${execution_id}`;

  const step_statuses = await base_funcs.getStepStatuses(execution_idd);
  
  let num_steps_executed = 0;
  let num_steps_passed = 0;
  let num_steps_failed = 0;
  let num_steps_errored = 0;

  for (const step_status of step_statuses) {
    if (step_status.executed) {
      num_steps_executed++;
      if (step_status.status === 'PASS' || step_status.status === 'OVERRIDE_PASS') {
        num_steps_passed++;
      } else if (step_status.status === 'FAIL' || step_status.status === 'OVERRIDE_FAIL') {
        num_steps_failed++;
      } else if (step_status.status === 'ERROR') {
        num_steps_errored++;
      }
    }
  }

  execution['num_steps_executed'] = num_steps_executed; 
  execution['num_steps_passed'] = num_steps_passed; 
  execution['num_steps_failed'] = num_steps_failed; 
  execution['num_steps_errored'] = num_steps_errored; 
  return Promise.resolve(execution);
}

/**
 * get execution status
 *
 * @param {String} execution_id - id of execution
 * @return {Promise} - Promise that may be fulfilled with an object that has execution status
 */
var getExecutionStatus = async function (execution_id) {
  const execution = await getExecution(execution_id);
  return Promise.resolve({'status': execution['status']});
}

/**
 * check if the execution is closed. If the execution has been closed, return a rejected promise
 * with the provided msg.
 *
 * @param {String} execution_id - id of execution
 * @param {String} msg - error message if the execution has been closed
 * @return {Promise} - Promise that may be rejected if the execution is closed or finalized
 */
var checkExecutionClosed = async function (execution_id, msg) {
  const execution = await getExecution(execution_id);
  
  if (execution['status'] == 'CLOSED' || execution['status'] == 'IN_REVIEW' || execution['status'] == 'FINALIZED') {
    return Promise.reject(msg);
  } else {
    return Promise.resolve();
  }
}


/**
 * get executions
 *
 * @param {Number} offset - starting index
 * @param {Number} limit - max count to return
 * @param {String} sort - ASC or DESC
 * @param {String} sort_by - sort by this property 
 * @param {String} execution_id - filter on execution_id
 * @param {String} description - filter on description field
 * @param {String} status - filter on status field
 * @param {String} statuses - filter on status (comma separated list)
 * @param {Boolean} completed - filter based on completion status. null to return any.
 * @param {String} from_time - search from this time (execution start time in UTC such as 2021-01-07T02:56:23.877Z)
 * @param {String} to_time - search up to this time (execution start time in UTC such as 2021-01-07T02:56:23.877Z)
 * @param {String} venue_id - filter based on venue id
 * @param {String} venue_name - filter based on venue name
 * @param {String} venue_type - filter based on venue type
 * @param {Boolean} run_for_score - filter based on run for score flag. null to return any.
 * @param {String} test_conductor - filter based on test conductor
 * @param {String} procedure_id - filter based on procedure_id 
 * @param {Number} version - filter based on procedure version
 * @param {String} institutional_id - filter based on institutional_id
 * @param {String} institutional_release_id - filter based on institutional_release_id
 * @return {Promise} - Promise that may be fulfilled with an array of execution meta data
 */
var getExecutions = async function (offset, limit, sort, sort_by, execution_id, description, 
  statuses, completed, 
  from_time, to_time, 
  venue_id, venue_name, venue_type,
  run_for_score, test_conductor, procedure_id, version, 
  institutional_id, institutional_release_id) {

  let cursor = null;
  let data = null;

  let offset_limit = '';
  if (offset !== null && limit !== null) {
    offset_limit = `LIMIT ${offset}, ${limit}`  
  } else if (limit !== null) {
    offset_limit = `LIMIT ${limit}` 
  } else if (offset !== null) {
    log.warning('Not allowed to specify only offset in query');
  }
  
  let execution_id_filter = '';
  if (execution_id !== null) {
    execution_id_filter = `FILTER LIKE(doc.execution_id, "%${execution_id}%", true)`;  
  }
    
  let description_filter = '';
  if (description !== null) {
    description_filter = `FILTER LIKE(doc.description, "%${description}%", true)`;  
  }
  
  let status_filter = '';
  if (statuses && statuses.length > 0) {
    let statuses_str = statuses.map(status => `"${status}"`).join(',');
    status_filter = `FILTER doc.status IN [${statuses_str}]`;  
  }
  
  let completed_filter = '';
  if (completed !== null) {
    completed_filter = completed ? `FILTER doc.time_completed != ""` : `FILTER doc.time_completed == ""`;   
  }
  
  let from_time_filter = '';
  if (from_time !== null) {
    from_time_filter = `FILTER doc.time_started >= "${from_time}"`;  
  }
  
  let to_time_filter = '';
  if (to_time !== null) {
    to_time_filter = `FILTER doc.time_started <= "${to_time}"`;  
  }

  let venue_id_filter = '';
  if (venue_id !== null) {
    venue_id_filter = `FILTER LIKE(doc.venue_id, "%${venue_id}%", true)`;  
  }

  let venue_name_filter = '';
  if (venue_name !== null) {
    venue_name_filter = `FILTER LIKE(doc.venue_name, "%${venue_name}%", true)`;  
  }  

  let venue_type_filter = '';
  if (venue_type !== null) {
    venue_type_filter = `
  LET venue_doc = DOCUMENT("venue", doc.venue_id)
  FILTER venue_doc.type == "${venue_type}"
  `  
  }
  
  let test_conductor_filter = '';
  if (test_conductor !== null) {
    test_conductor_filter = `
  LET matched_conductors = (
    FOR test_conductor IN doc.test_conductors
      FILTER LIKE(test_conductor, "%${test_conductor}%", true)
        RETURN test_conductor
  )
  FILTER LENGTH(matched_conductors) > 0
  `;  
  }

  let run_for_score_filter = '';
  if (run_for_score !== null) {
    if (run_for_score) {
  run_for_score_filter = `
  LET matched_run_for_scores = (
    FOR used_procedure IN doc.used_procedures
      FILTER used_procedure.run_for_score == true
        RETURN used_procedure.run_for_score
  )
  FILTER LENGTH(matched_run_for_scores) > 0
  `;
    } else {
  run_for_score_filter = `
  LET matched_run_for_scores = (
    FOR used_procedure IN doc.used_procedures
      FILTER used_procedure.run_for_score == true
        RETURN used_procedure.run_for_score
  )
  FILTER LENGTH(matched_run_for_scores) == 0
  `;
    }
  }

  const active_procedure_filters = [];


  if (procedure_id !== null) {
    active_procedure_filters.push(`      FILTER LIKE(used_procedure.procedure_id, "%${procedure_id}%", true)`);
  }
  
  if (version !== null) {
    active_procedure_filters.push(`      FILTER used_procedure.version == ${version}`);
  }

  if (institutional_id !== null) {
    active_procedure_filters.push(`      FILTER LIKE(used_procedure.institutional_id, "%${institutional_id}%", true)`);  
  }

  if (institutional_release_id !== null) {
    active_procedure_filters.push(`      FILTER LIKE(used_procedure.institutional_release_id, "%${institutional_release_id}%", true)`); 
  }

  let used_procedure_filter = '';
  if (active_procedure_filters.length > 0) {
    used_procedure_filter = `
  LET matched_used_procedures = (
    FOR used_procedure IN doc.used_procedures
${active_procedure_filters.join('\n')}
      RETURN used_procedure
  )
  FILTER LENGTH(matched_used_procedures) > 0
  `;  
  }

  let sort_option = `SORT doc.${sort_by === null ? 'time_started' : sort_by.toLowerCase()} ${sort === null ? 'DESC' : sort}`
  
  // Note: make sure offset_limit is the last filter so that it is applied after other filters have been applied.
  let q_str =
  `
FOR doc in execution   
  ${execution_id_filter}
  ${description_filter}    
  ${status_filter}
  ${completed_filter}  
  ${from_time_filter}
  ${to_time_filter}
  ${venue_id_filter}
  ${venue_name_filter}   
  ${venue_type_filter}
  ${test_conductor_filter}
  ${run_for_score_filter}
  ${used_procedure_filter}
  ${sort_option}
  ${offset_limit}    
  RETURN doc
`
  q_str = removeEmptyLines(q_str);

  try {
    cursor = await db.query(q_str, {}, {'count': true, 'fullCount': true});
    data = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get executions from DB: ' + get_sj_error_message(err)); 
  }

  for (let i = 0; i < data.length; i++) {
    sanitize_internal_attrs(data[i]);
  }
  const fullCount = cursor.extra.stats.hasOwnProperty('fullCount') ? cursor.extra.stats.fullCount : cursor.count;
  return Promise.resolve({'data': data, 'total_count': fullCount});

}


/**
 * create a venue group
 *
 * @param {Object} venueGroupInput - input data for venue group
 * @return {Promise} - Promise that may be fulfilled with a newly created venue group
 */
var createVenueGroup = async function(venueGroupInput) {
  var name = venueGroupInput['name'] || '';
  if (!name) {
    return Promise.reject('Name was not specified for venue group');
  }

  var venueGroupEmpty = {
    'name' : 'Default',
    'description' : 'Default venue group',
    'status' : 'ACTIVE',
  };

  var venueGroup = extend(true, {}, venueGroupEmpty, venueGroupInput);

  var key = uuid.v4();
  venueGroup['_key'] = key;
  venueGroup['venue_group_id'] = key;
  
  try {
    const res = await venue_group_collection.save(venueGroup, {returnNew: true});
    return Promise.resolve(sanitize_internal_attrs(res.new));
  } catch (err) {
    return Promise.reject('Failed to get save venue group in DB: ' + get_sj_error_message(err)); 
  }
}

/**
 * get venue groups
 *
 * @param {Number} offset - starting index
 * @param {Number} limit - max count to return
 * @param {String} sort - ASC or DESC
 * @param {String} status - filter based on . Use null to return all.
 * @param {String} venue_group_name - filter on venue group name
 * @param {String} description - filter on description field
 * @return {Promise} - Promise that may be fulfilled with an array of venue groups
 */
var getVenueGroups = async function (offset, limit, sort, status, venue_group_name, description) {

  let offset_limit = '';
  if (offset !== null && limit !== null) {
    offset_limit = `LIMIT ${offset}, ${limit}`  
  } else if (limit !== null) {
    offset_limit = `LIMIT ${limit}` 
  } else if (offset !== null) {
    log.warning('Not allowed to specify only offset in query');
  }  

  let sort_option = `SORT doc.name ${sort === null ? 'ASC' : sort}`
  
  let status_filter = '';
  if (status !== null) {
    status_filter = `FILTER doc.status =="${status}"`;  
  }

  let venue_group_name_filter = '';
  if (venue_group_name !== null) {
    venue_group_name_filter = `FILTER LIKE(doc.name, "%${venue_group_name}%", true)`;  
  }

  let description_filter = '';
  if (description !== null) {
    description_filter = `FILTER LIKE(doc.description, "%${description}%", true)`;  
  }
  // Note: make sure offset_limit is the last filter so that it is applied after other filters have been applied.
  let q_str =
  `
  FOR doc in venueGroup
    ${status_filter}
    ${description_filter}
    ${venue_group_name_filter}
    ${sort_option}
    ${offset_limit}    
    RETURN UNSET(doc, "_id", "_rev", "_key")
  `
  q_str = removeEmptyLines(q_str);
  
  log.trace(`getVenueGroups q_str: ${q_str}`);

  try {
    const cursor = await db.query(q_str, {}, {'count': true, 'fullCount': true});
    const data = await cursor.all();
    // fullCount is returned only when LIMIT is used in query. If it is not available, use count instead.
    const fullCount = cursor.extra.stats.hasOwnProperty('fullCount') ? cursor.extra.stats.fullCount : cursor.count;
    return Promise.resolve({'data': data, 'total_count': fullCount});
  } catch (err) {
    return Promise.reject(get_sj_error_message(err));
  }
}

/**
 * get a venue group
 *
 * @param {String} venue_group_id - unique id of venue group
 * @return {Promise} - Promise that may be fulfilled with a venue group
 */
var getVenueGroup = async function(venue_group_id) {
  let venue_groups = null;
  try {
    venue_groups = await venue_group_collection.lookupByKeys([venue_group_id]);
  } catch (err) {
    return Promise.reject(get_sj_error_message(err));
  }

  if (venue_groups.length == 0) {
    return Promise.reject(`No venue group was found for venue_group_id: ${venue_group_id}`);
  }
  else if (venue_groups.length > 1) {
    return Promise.reject(`More than one venue group was found with the same id: ${venue_group_id}`);
  }
  else {
    return Promise.resolve(venue_groups[0]);
  }  
}

/**
 * update venue group
 *
 * @param {String} venue_group_id - Unique id of venue group
 * @param {Object} venue_group - venue group information
 * @return {Promise}
 */
var updateVenueGroup = async function(venue_group_id, venue_group) {
  try {
    await getVenueGroup(venue_group_id);
  } catch (err) {
    return Promise.reject({'error_code': 404, 'message': get_sj_error_message(err)});
  }

  try {
    return await venue_group_collection.update(venue_group_id, venue_group);
  } catch (err) {
    return Promise.reject({'error_code': 400, 'message': get_sj_error_message(err)});
  }
}

/**
 * get executions
 *
 * @param {Number} offset - starting index
 * @param {Number} limit - max count to return
 * @param {String} sort - ASC or DESC
 * @param {String} status - filter based on idle/in_use status. Use null to return all.
 * @param {String} exclude_status String Exclude venues of a given status. Use null if not applicable.
 * @param {String} description - filter on description field
 * @param {String} venue_type - type of venue 
 * @param {String} venue_name - filter on venue name
 * @param {String} venue_group_name - filter on venue group (exact match)
 * @param {String} venue_group_status - filter on venue group status (exact match)
 * @return {Promise} - Promise that may be fulfilled with an array of venues
 */
var getVenues = async function (offset, limit, sort, status, exclude_status, description, venue_type, venue_name, venue_group_name, venue_group_status) {

  let offset_limit = '';
  if (offset !== null && limit !== null) {
    offset_limit = `LIMIT ${offset}, ${limit}`  
  } else if (limit !== null) {
    offset_limit = `LIMIT ${limit}` 
  } else if (offset !== null) {
    log.warning('Not allowed to specify only offset in query');
  }  

  let sort_option = `SORT doc.name ${sort === null ? 'ASC' : sort}`
  
  let status_filter = '';
  if (status !== null) {
    status_filter = `FILTER doc.venue_status.status =="${status}"`;  
  }
  
  let exclude_status_filter = '';
  if (exclude_status !== null) {
    exclude_status_filter = `FILTER doc.venue_status.status !="${exclude_status}"`;  
  }  

  let description_filter = '';
  if (description !== null) {
    description_filter = `FILTER LIKE(doc.description, "%${description}%", true)`;  
  }  

  let venue_type_filter = '';
  if (venue_type !== null) {
    venue_type_filter = `FILTER doc.type =="${venue_type}"`;  
  }  

  let venue_name_filter = '';
  if (venue_name !== null) {
    venue_name_filter = `FILTER LIKE(doc.name, "%${venue_name}%", true)`;  
  }

  let venue_group_id_filter = `FILTER doc.venue_group_id == vg.venue_group_id`;
  let venue_group_name_filter = '';
  if (venue_group_name !== null) {
    venue_group_name_filter = `FILTER vg.name == "${venue_group_name}"`;  
  }

  let venue_group_status_filter = '';
  if (venue_group_status !== null) {
    venue_group_status_filter = `FILTER vg.status == "${venue_group_status}"`;  
  }

  // Note: make sure offset_limit is the last filter so that it is applied after other filters have been applied.
  let q_str =
  `
  FOR doc in venue
    FOR vg in venueGroup
    ${status_filter}
    ${exclude_status_filter}
    ${description_filter}
    ${venue_type_filter}        
    ${venue_name_filter}
    ${venue_group_id_filter}
    ${venue_group_name_filter}
    ${venue_group_status_filter}
    ${sort_option}
    ${offset_limit}    
    RETURN {v:UNSET(doc, "_id", "_rev", "_key"), venue_group_name: vg.name}
  `
  q_str = removeEmptyLines(q_str);
  
  log.trace(`getVenues q_str: ${q_str}`);

  try {
    const cursor = await db.query(q_str, {}, {'count': true, 'fullCount': true});
    const data = await cursor.all();

    // fullCount is returned only when LIMIT is used in query. If it is not available, use count instead.
    const fullCount = cursor.extra.stats.hasOwnProperty('fullCount') ? cursor.extra.stats.fullCount : cursor.count;
    const venues = data.map((d) => ({...d.v, venue_group_name: d.venue_group_name}))
    return Promise.resolve({'venues': venues, 'total_count': fullCount});
  } catch (err) {
    return Promise.reject(get_sj_error_message(err));
  }
}

/**
 * get procedure labels
 *
 * @param {Number} offset - starting index
 * @param {Number} limit - max count to return
 * @param {String} sort - ASC or DESC
 * @param {String} name - filter on procedure label name
 * @param {String} description - filter on description field
 * @return {Promise} - Promise that may be fulfilled with an array of venues
 */
var getProcedureLabels = async function (offset, limit, sort, name, description) {

  let offset_limit = '';
  if (offset !== null && limit !== null) {
    offset_limit = `LIMIT ${offset}, ${limit}`  
  } else if (limit !== null) {
    offset_limit = `LIMIT ${limit}` 
  } else if (offset !== null) {
    log.warning('Not allowed to specify only offset in query');
  }  

  let sort_option = `SORT doc.name ${sort === null ? 'ASC' : sort}`
  
  let description_filter = '';
  if (description !== null) {
    description_filter = `FILTER LIKE(doc.description, "%${description}%", true)`;  
  }  

  let name_filter = '';
  if (name !== null) {
    name_filter = `FILTER LIKE(doc.name, "%${name}%", true)`;  
  }

  // Note: make sure offset_limit is the last filter so that it is applied after other filters have been applied.
  let q_str =
  `
  FOR doc in procedureLabel   
    ${description_filter}      
    ${name_filter}
    ${sort_option}
    ${offset_limit}    
    RETURN UNSET(doc, "_id", "_rev", "_key")
  `
  q_str = removeEmptyLines(q_str);
  
  log.trace(`getProcedureLabels q_str: ${q_str}`);  

  try {
    const cursor = await db.query(q_str, {}, {'count': true, 'fullCount': true});
    const data = await cursor.all();
    // fullCount is returned only when LIMIT is used in query. If it is not available, use count instead.
    const fullCount = cursor.extra.stats.hasOwnProperty('fullCount') ? cursor.extra.stats.fullCount : cursor.count;
    return Promise.resolve({'data': data, 'total_count': fullCount});
  } catch (err) {
    return Promise.reject(get_sj_error_message(err));
  }
}

/**
 * get a venue type of an execution
 *
 * @param {String} execution_id - unique id of execution
 * @return {Promise} - Promise that may be fulfilled with the venue type.  example: 'WSTS'
 */
var getVenueTypeForExecution = async function (execution_id) {

  let q_str =
  `
  FOR execution_doc in execution
    FILTER execution_doc.execution_id == "${execution_id}"
    FOR venue_doc in venue
      FILTER venue_doc.venue_id == execution_doc.venue_id
      RETURN {"venue_type": venue_doc.type}
  `

  let cursor = null;
  let data = null;
  try {
    cursor = await db.query(q_str, {}, {'count': true, 'fullCount': true});
    data = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get executions from DB: ' + get_sj_error_message(err)); 
  }

  if (data.length == 0) {
    return Promise.reject('Could not determine the venue type of execution. No record was found. execution_id: {0}'.format(execution_id));
  } else if (data.length > 1) {
    return Promise.reject('Could not determine the venue type of execution. Multiple records were found. execution_id: {0}'.format(execution_id));
  } else {
    return Promise.resolve(data[0]['venue_type']);
  }      
}

/**
 * get a venue
 *
 * @param {String} venue_id - unique id of venue
 * @return {Promise} - Promise that may be fulfilled with a venue
 */
var getVenue = async function(venue_id) {
  let venues = null;
  try {
    venues = await venue_collection.lookupByKeys([venue_id]);
  } catch (err) {
    return Promise.reject(get_sj_error_message(err));
  }

  if (venues.length == 0) {
    return Promise.reject('No venue was found: {0}'.format(venue_id));
  }
  else if (venues.length > 1) {
    return Promise.reject('More than one venue was found with the same id: {0}'.format(venue_id));
  }
  else {
    const venue = venues[0]
    let venue_group_name = '';
    if (venue.venue_group_id) {
      const venue_groups = await venue_group_collection.lookupByKeys([venue.venue_group_id]);
      if (venue_groups.length == 0) {
        log.warning(`Venue group was not found for venue_id: ${venue_id}. venue_group_id: ${venue.venue_group_id}`);
      } else if (venue_groups.length > 1) {
        log.warning(`More than one venue group was found for venue_id: ${venue_id}. venue_group_id: ${venue.venue_group_id}`);
      } else {
        venue_group_name = venue_groups[0].name
      }
    }

    venue.venue_group_name = venue_group_name
    return Promise.resolve(venue);
  }  
}

/**
 * create a venue
 *
 * @param {Object} venueInput - input data for venue
 * @return {Promise} - Promise that may be fulfilled with a newly created venue
 */
var createVenue = async function(venueInput) {
  var name = venueInput['name'] || '';
  if (!name) {
    return Promise.reject('Name was not specified for venue');
  }

  if (!venueInput.venue_group_id) {
    const res = await getVenueGroups(null, null, null, null, null, null);
    if (res.total_count > 0) {
      for (const venueGroup of res.data) {
        if (venueGroup.name === 'Default') {
          venueInput.venue_group_id = venueGroup.venue_group_id;
          break;
        }
      }
      if (!venueInput.venue_group_id) {
        venueInput.venue_group_id = res.data[0].venue_group_id
      }
    } else {
      return Promise.reject('Cannot add a new venue. No venue group has been defined');
    }
  }

  var venueEmpty = {
    'venue_status' : {
      'test_conductor' : '',
      'execution_id' : '',
      'started_on' : '',
      'status' : 'AVAILABLE'
    },
    'name' : '',
    'description' : '',
    'location' : '',
    'ampcs_address' : '',
    'sse_address' : '',
    'type' : '',
    'venue_id' : '',
    'url' : ''
  };

  var venue = extend(true, {}, venueEmpty, venueInput);

  var elem_id = uuid.v4();
  venue['_key'] = elem_id;
  venue['venue_id'] = elem_id;
  
  try {
    const res = await venue_collection.save(venue, {returnNew: true});
    return Promise.resolve(sanitize_internal_attrs(res.new));
  } catch (err) {
    return Promise.reject('Failed to get save venue in DB: ' + get_sj_error_message(err)); 
  }
}

/**
 * delete a venue
 *
 * @param {String} venue_id - Unique id of venue
 * @return {Promise}
 */
var deleteVenue = async function(venue_id) {
  try {
    await venue_collection.removeByKeys([venue_id]);
    return Promise.resolve();
  } catch (err) {
    return Promise.reject('Failed to delete venue from DB: ' + get_sj_error_message(err)); 
  }
}


/**
 * get elements of an execution
 *
 * @param {String} venue_id - Unique id of venue
 * @param {Object} venue_status - New status of venue
 * @return {Promise}
 */
var updateVenueStatus = async function (venue_id, venue_status) {
  // Check if the venue exists.
  try {
    await getVenue(venue_id);
  } catch (err) {
    return Promise.reject({'error_code': 404, 'message': get_sj_error_message(err)});
  }

  let new_venue = {'venue_status': venue_status};

  try {
    return await venue_collection.update(venue_id, new_venue);
  } catch (err) {
    return Promise.reject({'error_code': 400, 'message': get_sj_error_message(err)});
  }
}

/**
 * get elements of an execution
 *
 * @param {String} venue_id - Unique id of venue
 * @param {Object} venue - New venue information
 * @return {Promise}
 */
var updateVenue = async function(venue_id, venue) {
  try {
    await getVenue(venue_id);
  } catch (err) {
    return Promise.reject({'error_code': 404, 'message': get_sj_error_message(err)});
  }

  try {
    return await venue_collection.update(venue_id, venue);
  } catch (err) {
    return Promise.reject({'error_code': 400, 'message': get_sj_error_message(err)});
  }
}

/**
 * get a comment of an element
 *
 * @param {String} elem_id - Unique id of element
 * @param {String} comment_id - Unique id of comment
 * @return {Promise} - A promise that may be fulfilled with a comment
 */
var getFile = async function(elem_id, file_id) {
  return base_funcs.getFile('EXECUTION', elem_id, file_id);
}

var getExecFile = async function(execution_id, file_id) {
  const execution = await getExecution(execution_id);

  log.trace(`elem: ${JSON.stringify(execution)}`);
  let idx = -1;
  let files = null;
  if (execution.hasOwnProperty('files')) {
    files = execution['files'];
    for (let i = 0; i < files.length; i++) {
      if(files[i]['file_id'] == file_id) {
        idx = i;
        break;
      }
    }
  }

  if (idx == -1) {
    return Promise.reject('File was not found. file_id: {0}'.format(file_id));
  }
  return Promise.resolve(files[idx]);
}


/**
 * get files of an element
 *
 * @param {String} elem_id - Unique id of element
 * @return {Promise} - A promise that may be fulfilled with an array of comments
 */
var getFiles = async function(elem_id, offset, limit) {
  return base_funcs.getFiles('EXECUTION', elem_id, offset, limit);
}



var getExecFiles = async function(execution_id, offset, limit) {
  let execution = await getExecution(execution_id);

  let files = [];
  log.trace(`execution: ${JSON.stringify(execution)}`);
  if (execution.hasOwnProperty('files')) {
    files = execution['files'];
  }

  log.trace(`files: ${JSON.stringify(files)}`);
  let response = {'total' : files.length}
  if(offset)
    files = files.slice(offset)
  if(limit)
    files = files.slice(0,limit)
  response['files'] = files
  return Promise.resolve(response);
}



/**
 * delete a file
 *
 * @param {String} elem_id - Unique id of element
 * @param {String} comment_id - Unique id of comment
 * @return {Promise}
 */
var deleteFile = async function(elem_id, file_id) {
  return base_funcs.deleteFile('EXECUTION', elem_id, file_id);
}

var deleteExecFile = async function(execution_id, file_id) {
  const execution = await getExecution(execution_id);

  let idx = -1;
  let files = null;
  if (execution.hasOwnProperty('files')) {
    files = execution['files'];
    for (let i = 0; i < files.length; i++) {
      if(files[i]['file_id'] == file_id) {
        idx = i;
        break;
      }
    }
  }
  if (idx == -1) {
    log.error(`File was not found. file_id: ${file_id}`);
    return Promise.reject(`File was not found. file_id: ${file_id}`);
  }

  var fileToDelete = files[idx]
  files.splice(idx, 1);

  try {
    await execution_collection.update(execution_id, {'files': files});
  } catch (err) {
    return Promise.reject('Failed to update execution in DB: ' + get_sj_error_message(err)); 
  }

  return Promise.resolve(fileToDelete);
}


/**
 * add a conversation
 *
 * @param {String} execution_id - Unique id of execution
 * @param {String} elem_id - Unique id of element
 * @param {String} input_conversation - conversation input
 * @param {String} user_name - user name
 * @return {Promise} - Promise that may be fulfilled with the comment
 */
var addConversation = async function(execution_id, elem_id, input_conversation, user_name) {
  const res = await base_funcs.addConversation('EXECUTION', execution_id, elem_id, input_conversation, user_name);
  await updateConversationsCount(execution_id);
  return res;
}

/**
 * get conversations
 *
 * @param {String} execution_id - Unique id of execution
 * @param {String} elem_id - Unique id of element
 * @return {Promise} - Promise that may be fulfilled with the comment
 */
var getConversations = async function(execution_id, elem_id) {
  return await base_funcs.getConversations('EXECUTION', execution_id, elem_id);
}

/**
 * get a conversation of an element
 *
 * @param {String} execution_id - Unique id of execution
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @return {Promise} - A promise that may be fulfilled with a conversation
 */
var getConversation = async function(execution_id, elem_id, conversation_id) {
  return await base_funcs.getConversation('EXECUTION', execution_id, elem_id, conversation_id);
}

/**
 * update a conversation
 *
 * @param {String} execution_id - Unique id of execution
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @param {String} conversation_input - conversation input
 * @param {String} user_name - user name
 * @return {Promise} - Promise that may be fulfilled with the comment
 */
var updateConversation = async function(execution_id, elem_id, conversation_id, conversation_input, user_name) {
  const res = await base_funcs.updateConversation('EXECUTION', execution_id, elem_id, conversation_id, conversation_input, user_name);
  await updateConversationsCount(execution_id);
  return res;
}

/**
 * delete a conversation
 *
 * @param {String} execution_id - Unique id of execution
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @return {Promise}
 */
var deleteConversation = async function(execution_id, elem_id, conversation_id) {
  const res = await base_funcs.deleteConversation('EXECUTION', execution_id, elem_id, conversation_id);
  await updateConversationsCount(execution_id);
  return res;
}

/**
 * update conversation count for execution
 *
 * @param {String} execution_id - Unique id of execution
 * @return {Promise} - Promise updated version info
 */
 var updateConversationsCount = async function(execution_id) {
  const elems = await base_funcs.getConversationStatuses('EXECUTION', `execution/${execution_id}`);
  
  let comment_conversations_count = 0;
  let unresolved_comment_conversations_count = 0;
  let ar_conversations_count = 0;
  let unresolved_ar_conversations_count = 0;
  let dr_conversations_count = 0;
  let unresolved_dr_conversations_count = 0;
  
  for (const elem of elems) {
    if (elem.conversations) {
      for (const conversation of elem.conversations) {
        if (conversation.type === 'COMMENT') {
          comment_conversations_count++;
          if (conversation.status === 'UNRESOLVED') {
            unresolved_comment_conversations_count++;
          }
        } else if (conversation.type === 'ACTIVITY_REPORT_COMMENT') {
          ar_conversations_count++;
          if (conversation.status === 'UNRESOLVED') {
            unresolved_ar_conversations_count++;
          }
        } else if (conversation.type === 'DATA_REVIEW_COMMENT') {
          dr_conversations_count++;
          if (conversation.status === 'UNRESOLVED') {
            unresolved_dr_conversations_count++;
          }
        }
      }
    }
  }

  const conversations_count = comment_conversations_count + 
    ar_conversations_count + dr_conversations_count;
  const unresolved_conversations_count = unresolved_comment_conversations_count + 
    unresolved_ar_conversations_count + unresolved_dr_conversations_count;

  return await updateExecution(execution_id, {
    comment_conversations_count: comment_conversations_count,
    unresolved_comment_conversations_count: unresolved_comment_conversations_count,
    ar_conversations_count: ar_conversations_count,
    unresolved_ar_conversations_count: unresolved_ar_conversations_count,
    dr_conversations_count: dr_conversations_count,
    unresolved_dr_conversations_count: unresolved_dr_conversations_count,
    conversations_count: conversations_count,
    unresolved_conversations_count: unresolved_conversations_count
  });
}

/**
 * add a comment
 *
 * @param {String} execution_id - Unique id of execution
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @param {String} input_comment - New comment
 * @param {String} user_name - user name
 * @return {Promise} - Promise that may be fulfilled with the comment
 */
var addComment = async function(execution_id, elem_id, conversation_id, input_comment, user_name) {
  return await base_funcs.addComment('EXECUTION', execution_id, elem_id, conversation_id, input_comment, user_name);
}

/**
 * get comments of an element
 *
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @return {Promise} - A promise that may be fulfilled with an array of comments
 */
var getComments = async function(execution_id, elem_id, conversation_id, offset, limit) {
  return await base_funcs.getComments('EXECUTION', execution_id, elem_id, conversation_id, offset, limit);
}

/**
 * get a comment of an element
 *
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @param {String} comment_id - Unique id of comment
 * @return {Promise} - A promise that may be fulfilled with a comment
 */
var getComment = async function(execution_id, elem_id, conversation_id, comment_id) {
  return await base_funcs.getComment('EXECUTION', execution_id, elem_id, conversation_id, comment_id);
}

/**
 * update a comment
 *
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @param {String} comment_id - Unique id of comment
 * @param {String} comment_input - New comment
 * @param {String} user_name - user name
 * @return {Promise} - Promise that may be fulfilled with the comment
 */
var updateComment = async function(execution_id, elem_id, conversation_id, comment_id, comment_input, user_name) {
  return await base_funcs.updateComment('EXECUTION', execution_id, elem_id, conversation_id, comment_id, comment_input, user_name);
}

/**
 * delete a comment
 *
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @param {String} comment_id - Unique id of comment
 * @return {Promise}
 */
var deleteComment = async function(execution_id, elem_id, conversation_id, comment_id) {
  return await base_funcs.deleteComment('EXECUTION', execution_id, elem_id, conversation_id, comment_id);
}

/**
 * add file_info
 *
 * @param {String} elem_id - Unique id of element
 * @param {String} input_comment - New comment
 * @return {Promise} - Promise that may be fulfilled with the comment
 */
var addFile = async function(elem_id, input_file) {
  return await base_funcs.addFile('EXECUTION', elem_id, input_file);
}

var addFileExec = async function(execution_id, input_file) {
  let key = uuid.v4();
  let file_info_def = {
    'file_id': key,
    'file_name': '',
    'url': ''
  }

  let file_info = extend(true, {}, file_info_def, input_file);

  const execution = await getExecution(execution_id);

  let files = execution.hasOwnProperty('files') ? execution['files'] : [];

  files.push(file_info);

  try {
    await execution_collection.update(execution_id, {'files': files});
  } catch (err) {
    return Promise.reject('Failed to update execution in DB: ' + get_sj_error_message(err));
  }

  return Promise.resolve(file_info);
}



/**
 * Add an element to execution or a procedure version
 *
 * @param {String} execution_id - Unique id of execution
 * @param {Object} input_elem - Element to add
 * @param {String} insert_after_id - id of an element after which new element will be added.
 *                 Use "-1" to insert as the first element.
 * @param {String} level - Relationship of the new element with respect to "insert_after_id".
 *                 Either CHILD or SIBLING.
 * @return {Promise} promise that will be fulfilled with the new element and the
 * list of elements whose numbers were changed.
 */
var addElement = async function (execution_id, input_elem, insert_after_id, level) {
  const execution = await getExecution(execution_id);
  if (execution && execution.status !== 'IDLE') {
    return Promise.reject('Cannot add element when execution is not IDLE. First abort any running step');
  }  
  return base_funcs.addElement('EXECUTION', execution_id, input_elem, insert_after_id, level);
}

/**
 * Move an element
 *
 * @param {String} execution_id - Unique id of execution
 * @param {Object} elem_ids - ids of elements to move
 * @param {String} insert_after_id - id of an element after which the element will be moved.
 *                 Use "-1" to insert as the first element.
 * @param {String} level - Relationship of the element with respect to "insert_after_id".
 *                 Either CHILD or SIBLING.
 * @return {Promise} promise that will be fulfilled with the
 * list of elements whose numbers were changed.
 */
var moveElement = async function(execution_id, elem_ids, insert_after_id, level) {
  const execution = await getExecution(execution_id);
  if (execution && execution.status !== 'IDLE') {
    return Promise.reject('Cannot move element when execution is not IDLE. First abort any running step');
  }  
  return base_funcs.moveElement('EXECUTION', execution_id, elem_ids, insert_after_id, level);  
}

/**
 * Copy an element
 *
 * @param {String} execution_id - Unique id of execution
 * @param {Array} elem_ids - ids of element to copy
 * @param {String} insert_after_id - id of an element after which the element will be moved.
 *                 Use "-1" to insert as the first element.
 * @param {String} level - Relationship of the element with respect to "insert_after_id".
 *                 Either CHILD or SIBLING.
 * @param {String} source_execution_id - id of the the execution of the source (optional). 
 *                  Use null if not provided. This will take precedence over source_procedure_id.
 * @param {String} source_procedure_id - id of the the procedure of the source (optional). 
 *                  Use null if not provided. source_procedure_version must be provided as well.
 * @param {Integer} source_procedure_version - version of the the procedure of the source (optional). 
 *                  Use null if not provided. source_procedure_id must be provided as well.
 * @return {Promise} promise that will be fulfilled with the new elements and the
 * list of elements whose numbers were changed.
 */
var copyElement = async function(execution_id, elem_ids, insert_after_id, level, 
  source_execution_id, source_procedure_id, source_procedure_version) {

  // default values
  let target_root_type = 'EXECUTION';
  let target_root_id = execution_id;  
  let source_root_type = 'EXECUTION';
  let source_root_id = execution_id;
  
  const execution = await getExecution(execution_id);
  if (execution && execution.status !== 'IDLE') {
    return Promise.reject('Cannot copy element when execution is not IDLE. First abort any running step');
  }

  if (source_execution_id) {
    source_root_type = 'EXECUTION';
    source_root_id = source_execution_id;
  } else if (source_procedure_id && (source_procedure_version !== null)) {
    source_root_type = 'PROCEDURE';
    source_root_id = await procedure_funcs.getProcedureVersionId(source_procedure_id, source_procedure_version);
  } else if (source_procedure_id && (source_procedure_version === null)) {
    throw new Error('source_procedure_version was not provided for source_procedure_id');
  } else if ((source_procedure_id === null) && (source_procedure_version !== null)) {
    throw new Error('source_procedure_id was not provided for source_procedure_version');
  }

  return base_funcs.copyElement(source_root_type, target_root_type, source_root_id, elem_ids, target_root_id, insert_after_id, level);  
}

/**
 * Get elements of execution.
 * 
 * @param {String} root_idd - id of execution or element including collection name.
 *                            For example, 'execution/id-123' or 'element/id-432'
 * @param {String} elem_type - elem type filter
 * @param {String} step_type - step type filter
 * @param {String} description - description filter
 * @param {Boolean} all_elements - include all elements regardless of comments
 * @param {Boolean} comment_filter - include elements with general comments
*/
var getElements = async function(root_idd, elem_type, step_type, description,
  all_elements=false, comment_filter=false) {
  log.trace(`getElements root_idd: ${root_idd}`);
  
  return await base_funcs.getElements('EXECUTION', root_idd, elem_type, step_type, description,
    all_elements, comment_filter, false, false);
}

/**
 * Get outline of execution
 * 
 * @param {String} root_idd - id of execution including collection name.
 *                            For example, 'execution/id-123'
*/
var getOutline = async function(root_idd) {
  log.trace(`getOutline root_idd: ${root_idd}`);
  
  const root = await base_funcs.getStructure('EXECUTION', root_idd, false);

  let elems = [];
  base_funcs.collectOutlineElements(root, elems);
  return Promise.resolve(elems);
}

/**
 * Get the content of the element
 * @param {String} elem_id - unique id of element (section, step, or paragraph)
 * @return {Promise}
*/
var getElement = async function(elem_id) {
  return await base_funcs.getElement('EXECUTION', elem_id);
}

/**
 * Delete an element from execution
 * @param {String} elem_id - id of the element to delete
 * @param {Boolean} force - if true, delete elements even when they have been executed  
 * @return {Promise} promise that will be fulfilled with the
 * list of elements whose numbers were changed.
 */
var deleteElement = async function(elem_id, force) {
  if (!force) {
    const elem = await getElement(elem_id);
  
    // Internally, ADDED redline can be applied to section.
    // Functionally, redline sections are not considered as redline.
    // So redline section can be deleted (instead of discard).
    // base_funcs.deleteElement() below checks if the section contains any redline steps
    // and will reject delete operation if so. 
    if (base_funcs.isRedlineElement(elem) && elem.elem_type !== 'SECTION') {
      return Promise.reject('Cannot delete a redline element. Discard it instead.');
    }
    
    const execution = await getExecution(elem.execution_id);
    if (execution && execution.status !== 'IDLE') {
      return Promise.reject('Cannot delete element when execution is not IDLE. First abort any running step');
    }
  }
  let check_redline = !force;
  return await base_funcs.deleteElement('EXECUTION', elem_id, check_redline);
}

/**
 * modify an element to create a redline/blueline
 * @param {String} execution_id - execution id
 * @param {String} elem_id - id of the element to delete
 * @return {Promise} promise that will be fulfilled with ModifyElementResponse
 */
var modifyElement = async function(execution_id, elem_id) {
  let root_type = 'EXECUTION';
  let var_dict = base_funcs.get_root_specific_variables(root_type);

  let elem_idd = 'element/{0}'.format(elem_id);
  let root_idd = 'execution/{0}'.format(execution_id);

  let elem_original = null;  
  let elem_modifying = null;

  let elem_modifying_key = uuid.v4();  
  let elem_modifying_idd = 'element/{0}'.format(elem_modifying_key);

  let insert_after_id = elem_id;

  let target_parent_id = null;   // db key of the parent element
  let target_parent_idd = null;  // db id of the parent element 
  let target_parent = null;

  let target_idx = 0;            // index at the level of insertion

  let elem_dict = {};
  let edge_dict = {};    // dict from elem_idd to edge
  let root_node = null;

  let elems_to_add = [];  
  let elems_to_update = [];
  let edges_to_update = {};
  let edges_to_add = [];  
  let updated_numbers = [];

  let cursor = null;
  let edges = null;
  let res = null;
  
  const execution = await getExecution(execution_id);
  if (execution && execution.status !== 'IDLE') {
    return Promise.reject('Cannot create redline element when execution is not IDLE. First abort any running step');
  }  

  const elem = await getElement(elem_id);

  if (elem.procedure_modification_status == definitions.PMS.ORIGINAL) {
    if (elem.run_for_score) {
      // ok
    } else {
      let msg = 'Cannot modify element that is not under run for score. elem_id: {0} procedure_modification_status: {1}'.format(elem_id, 
        elem.procedure_modification_status);
      return Promise.reject(msg);
    }
  } else if (elem.procedure_modification_status == definitions.PMS.MODIFIED) {
    // ok
  } else {
    let msg = 'Cannot modify element that is not ORIGINAL or MODIFIED. elem_id: {0} procedure_modification_status: {1}'.format(elem_id, 
      elem.procedure_modification_status);
    return Promise.reject(msg);
  }

  if (elem.elem_type == 'SECTION') {
    let msg = 'Cannot redline/blueline a section. elem_id: {0}'.format(elem_id);
    return Promise.reject(msg);      
  }

  elem_original = elem;
    
  try {
    cursor = await step_order_collection.byExample({'_to': elem_idd});
    edges = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get parent element from DB: ' + get_sj_error_message(err)); 
  }

  if (edges.length == 0) {
    let msg = `No parent was found for elem_id: ${elem_id}`;
    log.error(msg);
    return Promise.reject(msg);
  } else {
    target_parent_id = edges[0]._from.split('/')[1];
    target_parent_idd = edges[0]._from;
  }

  log.trace(`build tree root_idd: ${root_idd}`);  
  try {
    cursor = await db.query(
      `
      FOR vertex, edge
        IN 0..10000
        OUTBOUND '${root_idd}'
        GRAPH 'execution_graph'
        OPTIONS {bfs: true}
        RETURN {
            v: {
                '_id': vertex._id,
                '_key': vertex._key,
                'number': vertex.number,
                'elem_id': vertex.elem_id,
                'elem_type': vertex.elem_type,
                'procedure_id': vertex.procedure_id,
                'procedure_section_id': vertex.procedure_section_id,
                'procedure_modification_status': vertex.procedure_modification_status,
                'title': vertex.title,
                'execution_id': vertex.execution_id
            },
            e: edge
        }
      `,
      {},
      {count: true}
    );
    res = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get elements graph from DB: ' + get_sj_error_message(err)); 
  }
  
  if (res.length > 0) {
    root_node = res[0].v;
  }

  for (let entry of res) {
    let vertex = entry.hasOwnProperty('v') ? entry.v : null;
    let edge = entry.hasOwnProperty('e') ? entry.e : null;

    if (vertex) {
      elem_dict[vertex._id] = vertex;
      if (edge) {
        edge_dict[vertex._id] = edge;
      }
    }            

    if (edge) {
      if (edge._id.startsWith(definitions.STEP_ORDER)) {
        let parent = elem_dict[edge._from];
        if (!parent.hasOwnProperty('children')) {
          parent.children = [];
        }
        // Note: cache the parent_idd temporarily to be able to find the parent.
        vertex.parent_idd = parent._id;                
        vertex.idx = edge['idx'];
        parent.children.push(vertex);
      }
    }
  }

  target_parent = elem_dict[target_parent_idd];

  if (!target_parent) {
    return Promise.reject('Parent node was not found for elem_idd : {0}'.format(elem_idd));
  }    
  
  // sort           
  sortChildren(root_node);                     

  // Find the target idx
  let current_modifying_elem = null;
  for (let i=0; i < target_parent.children.length; i++) {
    let child_node = target_parent.children[i];
    if (child_node.elem_id == elem_id) {
      for (let j=i+1; j < target_parent.children.length; j++) {
        let sibling_node = target_parent.children[j];
        let sibling_modification_status = sibling_node['procedure_modification_status'];

        if (sibling_modification_status === definitions.PMS.MODIFYING) {
          // if this elem has been modified, created redline after the current modifying elem.
          insert_after_id = sibling_node['elem_id'];
          current_modifying_elem = sibling_node;
          break;
        } else if (sibling_modification_status === definitions.PMS.MODIFYING_OLD) {
          // if this elem has been modified more than once, continue to find the current
          // modifying elem.
          continue;
        } else {
          // stop the search if the next sibling has not been modified.
          // redline will be added right after the elem.
          break;
        }
      }
      // break the loop of i
      break;
    }
  }
  
  target_idx = base_funcs.get_target_idx(target_parent, insert_after_id, 'SIBLING');
  log.debug(`target_idx: ${target_idx}`);

  // insert to children
  if (!target_parent.hasOwnProperty('children')) {
    target_parent.children = [];
  }

  elem_modifying = extend(true, {}, elem_original);
  elem_modifying['idx'] = target_idx;
  elem_modifying['parent_idd'] = target_parent_idd;
  elem_modifying['procedure_modification_status'] = definitions.PMS.MODIFYING;    
  
  if (elem_original['procedure_modification_status'] != definitions.PMS.MODIFIED) {
    elems_to_update.push({'_key': elem_id, 'procedure_modification_status': definitions.PMS.MODIFIED});
    updated_numbers.push({
      'elem_id': elem_id, 
      'number': elem_original['number'], 
      'procedure_modification_status': definitions.PMS.MODIFIED
    });            
  }
  if (current_modifying_elem) {
    elems_to_update.push({'_key': current_modifying_elem['elem_id'], 'procedure_modification_status': definitions.PMS.MODIFYING_OLD});
    updated_numbers.push({
      'elem_id': current_modifying_elem['elem_id'], 
      'number': current_modifying_elem['number'], 
      'procedure_modification_status': definitions.PMS.MODIFYING_OLD
    });          
  }
  
  // insert at the target idx
  target_parent.children.splice(target_idx, 0, elem_modifying);
  
  // collect edges to update
  base_funcs.prepare_sibling_edges(target_parent, edge_dict, edges_to_update, target_idx, 1);  

  base_funcs.prepareElementForCopy('EXECUTION', 'EXECUTION', elem_modifying, [], elems_to_add, edges_to_add);

  if (elems_to_add.length > 1) {
    return Promise.reject('Should not create multiple elements via modification');
  }

  log.trace('Update data in db');

  if (elem_dict.hasOwnProperty(target_parent_idd)) {
    let parent = elem_dict[root_idd];

    let parent_number = parent.hasOwnProperty('number') ? parent['number'] : null;
    //
    base_funcs.update_number(root_type, parent, parent_number, 0, elems_to_update, updated_numbers, elem_modifying_idd);

    sanitizeElement(parent);

    // delete children since we need a flat list
    elems_to_add = elems_to_add.map(elem => {delete elem['children']; return elem});

    // Do not add parent_id to db
    let elems_to_add_for_db = elems_to_add.map(elem => {
      // make a copy
      let elem_for_db = extend(true, {}, elem);
      delete elem_for_db['parent_id']; 
      return elem_for_db;
    });

    log.trace(`elems_to_add: ${JSON.stringify(elems_to_add)}`);
    log.trace(`elems_to_add_for_db: ${JSON.stringify(elems_to_add_for_db)}`);
    log.trace(`elems_to_update: ${JSON.stringify(elems_to_update)}`);
    log.trace(`edges_to_add: ${JSON.stringify(edges_to_add)}`);
    log.trace(`edges_to_update: ${JSON.stringify(edges_to_update)}`);
    log.trace(`updated_numbers: ${JSON.stringify(updated_numbers)}`);

    try {
      await var_dict.element_collection.import(elems_to_add_for_db, {'type': 'documents'});
      await var_dict.element_collection.updateAll(elems_to_update);
      await var_dict.step_order_collection.import(edges_to_add, {'type': 'documents'});
      await var_dict.step_order_collection.updateAll(Object.values(edges_to_update));
    } catch (err) {
      return Promise.reject('Failed to update elements in DB: ' + get_sj_error_message(err));
    }

    const {elem_ids, parent_ids} = await base_funcs.getElementIds(root_type, root_idd);
    
    for (let i=0; i < elems_to_add.length; i++) {
      base_funcs.sanitize_internal_attrs(elems_to_add[i]);
    }
    return Promise.resolve({'elem': elems_to_add[0], 'numbers': updated_numbers, 'elem_ids': elem_ids});
  }
  else {
    return Promise.reject('Element is not found: {0}'.format(target_parent_idd));
  }  
}

/**
 * Collect edges that have different idx. This is a recursive function.
 * 
 * @param {Object} node - element
 * @param {Object} edge_dict _id to edge map
 * @param {Object} edge_to_update_map edges that have different idx. map from _id to edge (output)
 *
 */
 var findEdgesToUpdate = function(node, edge_dict, edge_to_update_map) {
  if (node.children) {
    for (const [i, child] of node.children.entries()) {
      child.idx = i;

      let edge = edge_dict[child._id];
      if (edge) {
        if (child.idx !== edge.idx) {
          // Make a copy not to modify edge_dict
          let edge_copy = deepcopy(edge);
          edge_copy.idx = child.idx;
          edge_to_update_map[child._id] = edge_copy;
        }
      } else {
        throw new Error(`edge was not found for element. elem_id: ${child.elem_id} number: ${child.number}`);
      }
    }

    for (const child of node.children) {
      findEdgesToUpdate(child, edge_dict, edge_to_update_map);
    }
  }
}

/**
 * discard a redline element
 * @param {String} execution_id - id of the execution
 * @param {String} elem_ids - ids of the elements to discard
 * @return {Promise} promise that will be fulfilled with the
 * list of elements whose numbers were changed.
 */
var discardElements = async function(execution_id, elem_ids) {
  let root_type = 'EXECUTION';
  let var_dict = base_funcs.get_root_specific_variables(root_type);

  let root_idd = 'execution/{0}'.format(execution_id);

  let elem_dict = {};    // dict from elem_idd to elem
  const edge_dict = {};    // dict from elem_idd to edge
  let root_node = null;

  const elem_to_delete_map = {};
  const edge_to_delete_map = {};
  const elem_to_update_map = {};
  const edge_to_update_map = {};

  let updated_numbers = [];

  let cursor = null;
  let res = null;
  
  const execution = await getExecution(execution_id);
  if (execution && execution.status !== 'IDLE') {
    return Promise.reject('Cannot discard redline element when execution is not IDLE. First abort any running step');
  }  

  log.trace(`build tree root_idd: ${root_idd}`);

  try {
    cursor = await db.query(
      `
      FOR vertex, edge
        IN 0..10000
        OUTBOUND '${root_idd}'
        GRAPH 'execution_graph'
        OPTIONS {bfs: true}
        RETURN {
            v: {
                '_id': vertex._id,
                '_key': vertex._key,
                'number': vertex.number,
                'elem_id': vertex.elem_id,
                'elem_type': vertex.elem_type,
                'procedure_id': vertex.procedure_id,
                'procedure_section_id': vertex.procedure_section_id,
                'procedure_modification_status': vertex.procedure_modification_status,
                'procedure_modification': vertex.procedure_modification,
                'executed': vertex.executed,
                'imported': vertex.imported,
                'title': vertex.title,
                'execution_id': vertex.execution_id
            },
            e: edge
        }
      `,
      {},
      {count: true}
    );
    res = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get elements graph from DB: ' + get_sj_error_message(err)); 
  }

  if (res.length > 0) {
    root_node = res[0].v;
  } else {
    return Promise.reject('Failed to get root element');
  }

  for (let entry of res) {
    let vertex = entry.hasOwnProperty('v') ? entry.v : null;
    let edge = entry.hasOwnProperty('e') ? entry.e : null;

    if (vertex) {
      elem_dict[vertex._id] = vertex;
      if (edge) {
        edge_dict[vertex._id] = edge;
      }
    }

    if (edge) {
      if (edge._id.startsWith(definitions.STEP_ORDER)) {
        let parent = elem_dict[edge._from];
        if (!parent.hasOwnProperty('children')) {
          parent.children = [];
        }
        // Note: cache the parent_idd temporarily to be able to find the parent.
        vertex.parent_idd = parent._id;                
        vertex.idx = edge['idx'];
        parent.children.push(vertex);
      }
    }
  }

  // sort           
  sortChildren(root_node);

  //console.log('elem_dict')
  //console.log(JSON.stringify(elem_dict, 0, 2));
  //console.log('edge_dict')
  //console.log(JSON.stringify(edge_dict, 0, 2));

  for (const elem_id of elem_ids) {
    let elem_idd = `element/${elem_id}`;
    let elem = elem_dict[elem_idd];
    if (elem) {
      if (elem.elem_type === 'SECTION') {
        let msg = 'Cannot discard a section. Discard child redlines and delete it instead. elem_id: {0} number: {1}'.format(elem_id, 
          elem.number);
        return Promise.reject(msg);
      }
      if (elem.procedure_modification_status === definitions.PMS.NONE) {
        let msg = 'Cannot discard an element that is not redlined/bluelined. elem_id: {0} number: {1} procedure_modification_status: {2}'.format(elem_id, 
          elem.number, elem.procedure_modification_status);
        return Promise.reject(msg);
      }
      if (elem.procedure_modification_status === definitions.PMS.ORIGINAL) {
        let msg = 'Cannot discard an original element. elem_id: {0} number: {1} procedure_modification_status: {2}'.format(elem_id, 
          elem.number, elem.procedure_modification_status);
        return Promise.reject(msg);
      }
      if (elem.procedure_modification_status === definitions.PMS.MODIFIED) {
        let msg = 'Cannot discard an element that is not active. elem_id: {0} number: {1} procedure_modification_status: {2}'.format(elem_id, 
          elem.number, elem.procedure_modification_status);
        return Promise.reject(msg);
      }
      if (elem.procedure_modification_status === definitions.PMS.MODIFYING_OLD) {
        let msg = 'Cannot discard an element that is not active. elem_id: {0} number: {1} procedure_modification_status: {2}'.format(elem_id, 
          elem.number, elem.procedure_modification_status);
        return Promise.reject(msg);
      }
      if (elem['procedure_modification'] && elem['procedure_modification']['approval'] && elem['procedure_modification']['approval']['status']) {
        if (elem['procedure_modification']['approval']['status'] === 'APPROVED') {
          let msg = 'Cannot discard a redline/blueline element that has been approved. Unapprove first. elem_id: {0} number: {1}'.format(elem_id,
            elem.number);
          return Promise.reject(msg);
        }
      }
      if (elem.executed === true) {
        let msg = 'Cannot discard an element that has been executed. elem_id: {0} number: {1}'.format(elem_id, elem.number);
        return Promise.reject(msg);
      }
      if (elem.imported === true) {
        let msg = 'Cannot discard a run procedure element that has been imported. elem_id: {0} number: {1}'.format(elem_id, elem.number);
        return Promise.reject(msg);
      }
    } else {
      return Promise.reject(`element was not found to discard. elem_id: ${elem_id}`);
    }
  }

  for (const elem_id of elem_ids) {
    let elem_idd = `element/${elem_id}`;
    let elem_target = elem_dict[elem_idd];

    if (elem_target.procedure_modification_status === definitions.PMS.MODIFYING) {
      elem_to_delete_map[elem_idd] = elem_target;
      edge_to_delete_map[elem_idd] = edge_dict[elem_idd];

      let target_parent = elem_dict[elem_target.parent_idd];

      if (!target_parent) {
        return Promise.reject(`Parent element was not found for. elem_id: ${elem_id} number: ${elem_target.number}`);
      }

      let previous_elem = null;
      for (const child_elem of target_parent.children) {
        if (child_elem._id === elem_idd) {
          if (previous_elem) {
            if (previous_elem['procedure_modification_status'] === definitions.PMS.MODIFIED) {
              elem_to_update_map[previous_elem._id] = {'_key': previous_elem.elem_id, 'procedure_modification_status': definitions.PMS.ORIGINAL}
              // TODO: add procedure_section_id, etc???
              updated_numbers.push({
                'elem_id': previous_elem['elem_id'],
                'number': previous_elem['number'],
                'procedure_modification_status': definitions.PMS.ORIGINAL
              });

            } else if (previous_elem['procedure_modification_status'] == definitions.PMS.MODIFYING_OLD) {
              elem_to_update_map[previous_elem._id] = {'_key': previous_elem['elem_id'], 'procedure_modification_status': definitions.PMS.MODIFYING};
              updated_numbers.push({
                'elem_id': previous_elem['elem_id'], 
                'number': previous_elem['number'], 
                'procedure_modification_status': definitions.PMS.MODIFYING
              });
            } else {
              let msg = 'Cannot discard a redline/blueline element. The previous element is not in an expected state. previous elem_id: {0} number: {1} procedure_modification_status: {2}'.format(
                previous_elem['elem_id'], previous_elem['number'], previous_elem['procedure_modification_status']);
              return Promise.reject(msg);
            }
          } else {
            let msg = 'Cannot discard a redline/blueline element. The previous element was not found. elem_id: {0} number: {1}'.format(
              elem_target['elem_id'], elem_target['number']);
            return Promise.reject(msg);
          }
        }
        previous_elem = child_elem;
      }
    } else if (elem_target.procedure_modification_status == definitions.PMS.ADDED) {
      elem_to_delete_map[elem_idd] = elem_target;
      edge_to_delete_map[elem_idd] = edge_dict[elem_idd];
    } else if (elem_target.procedure_modification_status == definitions.PMS.DELETED) {
      elem_to_update_map[elem_idd] = {
        '_key': elem_target['elem_id'], 
        'procedure_modification_status': definitions.PMS.ORIGINAL,
        'procedure_modification': {'justification': null, 'approval': null}    // set attributes to null to remove them in DB using keepNull=false
      };
      updated_numbers.push({
        'elem_id': elem_target['elem_id'], 
        'number': elem_target['number'], 
        'procedure_modification_status': definitions.PMS.ORIGINAL
      });
    }
  }

  for (const elem_idd in elem_to_delete_map) {
    let elem_to_delete = elem_dict[elem_idd];
    if (elem_to_delete) {
      let parent_elem = elem_dict[elem_to_delete.parent_idd];
      if (parent_elem) {
        if (parent_elem.children) {
          for (const [idx, child_elem] of parent_elem.children.entries()) {
            if (child_elem._id === elem_idd) {
              parent_elem.children.splice(idx, 1);
            }
          }
        } else {
          let msg = 'Parent element has no child. parent id: {0} number: {1}'.format(parent_elem.elem_id, parent_elem.number);
          return Promise.reject(msg);
        }
      } else {
        let msg = 'Cannot find parent of element to discard. elem_idd: {0} number: {1}'.format(elem_idd, elem_to_delete.number);
        return Promise.reject(msg);
      }
    } else {
      let msg = 'Cannot find element to discard. elem_idd: {0}'.format(elem_idd);
      return Promise.reject(msg);
    }
  }
  // find edges to be updated
  findEdgesToUpdate(root_node, edge_dict, edge_to_update_map);

  // update numbers
  const elems_to_update_number = [];
  let root_number = root_node.hasOwnProperty('number') ? root_node['number'] : null;
  base_funcs.update_number(root_type, root_node, root_number, 0, elems_to_update_number, updated_numbers, null);
  sanitizeElement(root_node);

  for (const elem_to_update_number of elems_to_update_number) {
    let elem_idd = `element/${elem_to_update_number._key}`;
    let elem = elem_to_update_map[elem_idd];
    if (elem) {
      log.warning(`Unexpected change of number. elem_idd: ${elem_idd} new number: ${elem_to_update_number.number}`);
    } else {
      elem_to_update_map[elem_idd] = elem_to_update_number;
    }
  }

  log.trace('Update data in db');

  const element_keys = Object.values(elem_to_delete_map).map((elem) => elem.elem_id);
  const step_order_keys = Object.values(edge_to_delete_map).map((edge) => edge._key);
  const elems_to_update = Object.values(elem_to_update_map);
  const edges_to_update = Object.values(edge_to_update_map);

  log.info('element_keys:', {data: element_keys});
  log.info('step_order_keys:', {data: step_order_keys});

  log.info('elems_to_update:', {data: elems_to_update});
  log.info('edges_to_update:', {data: edges_to_update});
  log.info('updated_numbers:', {data: updated_numbers});

  try {
    if (element_keys.length > 0) {
      await var_dict.element_collection.removeByKeys(element_keys);
    }
    if (step_order_keys.length > 0) {
      await var_dict.step_order_collection.removeByKeys(step_order_keys);
    }

    if (elems_to_update.length > 0) {
      await var_dict.element_collection.updateAll(elems_to_update, {'keepNull': false});
    }
    if (edges_to_update.length > 0) {
      await var_dict.step_order_collection.updateAll(edges_to_update);
    }
  } catch (err) {
    return Promise.reject('Failed to update elements in DB: ' + get_sj_error_message(err));
  }

  const elem_ids_res = await base_funcs.getElementIds(root_type, root_idd);
  
  return Promise.resolve({'numbers': updated_numbers, 'elem_ids': elem_ids_res.elem_ids});
}

/**
 * Update content of an element.
 * This will merge the current content with the content of elem_in.
 * @param {String} elem_id - id of the target element
 * @param {Object} elem_in - content of the element
*/
var updateElement = async function(elem_id, elem_in) {
  return base_funcs.updateElement('EXECUTION', elem_id, elem_in);
}

var addFileComment = async function(execution_id, elem_id, conversation_id, comment_id, input_file) {
  return base_funcs.addFileComment('EXECUTION', execution_id, elem_id, conversation_id, comment_id, input_file);
}

var getCommentFiles = async function(execution_id, elem_id, conversation_id, comment_id, offset, limit) {
  return base_funcs.getCommentFiles('EXECUTION', execution_id, elem_id, conversation_id, comment_id, offset, limit);
}

var getCommentFile = async function(execution_id, elem_id, conversation_id, comment_id, file_id) {
  return base_funcs.getCommentFile('EXECUTION', execution_id, elem_id, conversation_id, comment_id, file_id);
}

/**
 * delete file meta data
 *
 * @param {String} execution_id - Unique id of execution
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @param {String} comment_id - Unique id of comment
 * @param {String} file_id - Unique id of file
 * @return {Promise} - Promise that may be fulfilled with no value
 */

var deleteCommentFile = async function(execution_id, elem_id, conversation_id, comment_id, file_id) {
  return base_funcs.deleteCommentFile('EXECUTION', execution_id, elem_id, conversation_id, comment_id, file_id);
}


/**
 * Get execution, elements and edges
 *
 * @param {String} execution_id - id of procedure
 * @return {Promise}
 */
 async function exportExecution(execution_id) {

  const execution_info = await getExecution(execution_id);
  // Below is not needed since getExecution sanitizes the doc. But this does not hurt.
  sanitize_internal_attrs(execution_info);

  const res_elements = [];
  const res_edges = [];

  let {vertices, edges} = await base_funcs.getVerticesEdges('EXECUTION', `${definitions.EXECUTION}/${execution_id}`);
  for (const vertex of vertices) {
    if (vertex._id && vertex._id.startsWith(definitions.ELEMENT)) {
      sanitize_internal_attrs(vertex);
      res_elements.push(vertex);
    } else if (vertex._id && vertex._id.startsWith(definitions.EXECUTION)) {
      // ignore root vertex such as execution
    } else {
      return Promise.reject(`Unexpected vertex type during execution export: ${vertex._id}`);
    }
  }
  for (const edge of edges) {
    if (edge._id) {
      let edge_id = edge._id;
      sanitize_internal_attrs(edge);

      if (edge_id.startsWith(definitions.STEP_ORDER)) {
        edge['edge_collection_name'] = definitions.STEP_ORDER;
        res_edges.push(edge);
      } else if (edge_id.startsWith(definitions.RUN_RECORD)) {
        edge['edge_collection_name'] = definitions.RUN_RECORD;
        res_edges.push(edge);
      } else {
        return Promise.reject(`exportExecution. Unexpected edge type: ${edge_id}`);
      }
    } else {
      return Promise.reject(`exportExecution. Unexpected edge type: ${edge._id}`);
    }
  }

  return Promise.resolve({
    execution_info: execution_info,
    elements: res_elements,
    edges: res_edges
  });
}


/**
 * Import execution, elements and edges
 *
 * @param {Object} import_input - import input
 * @return {Promise}
 */
 async function importExecution(import_input) {
  const execution_id = import_input && import_input.execution_info ? import_input.execution_info.execution_id : null;
  if (!execution_id) {
    return Promise.reject(`Cannot import execution. execution id was not provided.`);
  }

  const elements =  import_input && import_input.elements ? import_input.elements : [];
  if (elements.length === 0) {
    log.warning(`No execution element was contained. execution_id: ${execution_id}`);
  }

  let res = null;
  let execution_info = null;

  try {
    execution_info = await getExecution(execution_id);
  } catch (err) {
    if (err === `No execution was found for execution_id: ${execution_id}`) {
      // continue
    } else {
      return Promise.reject(err);
    }
  }

  import_input.execution_info._key = execution_id;
  if (execution_info) {
    // execution exists
    try {
      await deleteExecution(execution_id);
    } catch (err) {
      return Promise.reject('Failed to delete execution: ' + get_sj_error_message(err)); 
    }
  }

  // create new execution
  try {
    res = await execution_collection.save(import_input.execution_info, {'returnNew': true});
  } catch (err) {
    let msg = 'Failed to save execution in DB: {0}'.format(get_sj_error_message(err));
    return Promise.reject(msg);
  }

  execution_info = res['new'];

  // import execution elements
  const edges = import_input && import_input.edges ? import_input.edges : [];
  if (edges.length === 0) {
    log.warning(`No execution element edge was contained. execution_id: ${execution_id}`);
  }

  for (const element of elements) {
    element._key = element.elem_id;
  }

  const elem_order_edges = [];
  const run_record_edges = [];

  for (const edge of edges) {
    if (edge.edge_collection_name === definitions.STEP_ORDER) {
      delete edge['edge_collection_name'];
      elem_order_edges.push(edge);
    } else if (edge.edge_collection_name === definitions.RUN_RECORD) {
      delete edge['edge_collection_name'];
      run_record_edges.push(edge);
    } else if (edge.edge_collection_name === definitions.NEXT_RUN) {
      // Old exported files may contain these. ignore
    } else {
      log.warning(`Unrecognized edge type: ${edge.edge_collection_name}`);
    }
  }

  try {
    log.debug(`importing execution elements. execution_id: ${execution_id} count: ${elements.length}`);
    await element_collection.import(elements, {'type': 'documents'});
  } catch (err) {
    let msg = `Failed to import elements. execution_id: ${execution_id}`;
    return Promise.reject(msg);
  }

  try {
    log.debug(`importing execution element edges. execution_id: ${execution_id} count: ${elem_order_edges.length}`);
    await step_order_collection.import(elem_order_edges, {'type': 'documents'});
  } catch (err) {
    let msg = `Failed to import element edges. execution_id: ${execution_id}`;
    return Promise.reject(msg);
  }

  try {
    log.debug(`importing execution run record edges. execution_id: ${execution_id} count: ${run_record_edges.length}`);
    await run_record_collection.import(run_record_edges, {'type': 'documents'});
  } catch (err) {
    let msg = `Failed to import run record edges. execution_id: ${execution_id}`;
    return Promise.reject(msg);
  }
}

var parse_username = function (authorization_header) {
  let username = '';
  if (authorization_header) {
    let decoded = jwt.verify(parse_token(authorization_header), public_pem, { algorithms: ['RS256'] });
    username = decoded['username'];  
  }
  return username;
}

var parse_token = function (key) {
  let token = '';

  let tokens = key.split(' ');
  if (tokens.length > 1) {
    token = tokens[1];
  } else {
    log.warning('authorization header is not in the correct format');
  }
  return token;
}
    
module.exports.addElement = addElement
module.exports.moveElement = moveElement
module.exports.copyElement = copyElement
module.exports.getElement = getElement
module.exports.getOutline = getOutline
module.exports.deleteElement = deleteElement
module.exports.updateElement = updateElement
module.exports.modifyElement = modifyElement
module.exports.discardElements = discardElements
module.exports.checkExecutionClosed = checkExecutionClosed
module.exports.getStep = getStep
module.exports.setStepInput = setStepInput
module.exports.setStepOutput = setStepOutput
module.exports.createNewRun = createNewRun
module.exports.getAsRun = getAsRun
module.exports.importProcedureSection = importProcedureSection
module.exports.getStepExecutionHistory = getStepExecutionHistory
module.exports.getConversations = getConversations
module.exports.addConversation = addConversation
module.exports.getConversation = getConversation
module.exports.updateConversation = updateConversation
module.exports.deleteConversation = deleteConversation
module.exports.createExecution = createExecution
module.exports.getExecutions = getExecutions
module.exports.getExecution = getExecution
module.exports.getExecutionFull = getExecutionFull
module.exports.getExecutionStatus = getExecutionStatus
module.exports.updateExecution = updateExecution
module.exports.updateUsedProcedures = updateUsedProcedures
module.exports.updateExecutionStatus = updateExecutionStatus
module.exports.getNextElement = getNextElement
module.exports.setExecutionBoundary = setExecutionBoundary
module.exports.createVenueGroup = createVenueGroup
module.exports.getVenueGroups = getVenueGroups
module.exports.getVenueGroup = getVenueGroup
module.exports.updateVenueGroup = updateVenueGroup
module.exports.createVenue = createVenue
module.exports.getVenues = getVenues
module.exports.getProcedureLabels = getProcedureLabels
module.exports.getVenueTypeForExecution = getVenueTypeForExecution
module.exports.getVenue = getVenue
module.exports.updateVenue = updateVenue
module.exports.updateVenueStatus = updateVenueStatus
module.exports.deleteVenue = deleteVenue
module.exports.deleteExecution = deleteExecution
module.exports.getLogging = getLogging
module.exports.updateLogging = updateLogging
module.exports.getFile = getFile
module.exports.getFiles = getFiles
module.exports.deleteFile = deleteFile
module.exports.addFile = addFile
module.exports.getExecFile = getExecFile
module.exports.getExecFiles = getExecFiles
module.exports.deleteExecFile = deleteExecFile
module.exports.addFileExec = addFileExec

module.exports.exportExecution = exportExecution
module.exports.importExecution = importExecution

module.exports.addComment = addComment
module.exports.getComments = getComments
module.exports.getComment = getComment
module.exports.updateComment = updateComment
module.exports.deleteComment = deleteComment

module.exports.addFileComment = addFileComment
module.exports.getCommentFiles = getCommentFiles
module.exports.getCommentFile = getCommentFile
module.exports.deleteCommentFile = deleteCommentFile

module.exports.parse_username = parse_username
module.exports.parse_token = parse_token
