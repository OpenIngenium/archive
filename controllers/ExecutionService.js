'use strict';
var base_funcs = require('../api/base_funcs');
var node_funcs = require('../api/node_funcs');
var util = require('util');
var log = base_funcs.log;

exports.create_execution = async function(args, res, next) {
  /**
   * Create an execution
   *
   * execution ExecutionInfoInput Execution meta data
   * returns ExecutionInfo
   **/
  let executionInput = args['execution']['value'];

  try {
    const data = await node_funcs.createExecution(executionInput);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when creating an execution', err);
    res.status(400).json(err_data);
  }
}

exports.create_execution_step = async function(args, res, next) {
  /**
   * Create a step
   *
   * execution_id String unique id of execution
   * step Step step definition including its type
   * insert_after_id String unique id of the element after which element(s) will be added/inserted. If not provided, element will be added/inserted to the last. To insert at the front, use \"-1\". (optional)
   * level String Add as a sibling or a child.  * `SIBLING` - As a sibling of insert_after_id element (Default) * `CHILD` - As a child of insert_after_element  (optional)
   * returns AddStepResponse
   **/
  let execution_id = args['execution_id']['value'];
  let step = args['step']['value'];
  let insert_after_id = args['insert_after_id']['value'];
  let level = args['level']['value'];

  try {
    await node_funcs.checkExecutionClosed(execution_id, 'Execution has been closed. Cannot add an element.');
    const data = await node_funcs.addElement(execution_id, step, insert_after_id, level);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when adding a step', err);
    res.status(400).json(err_data);
  }
}

exports.delete_execution = async function(args, res, next) {
  /**
   * Delete an execution
   *
   * execution_id String unique id of execution
   * no response value expected for this operation
   **/
  let execution_id = args['execution_id']['value'];

  try {
    const data = await node_funcs.deleteExecution(execution_id);
    res.status(204).end();
  } catch(err) {
    const err_data = base_funcs.push_error('Error when deleting an execution', err);
    res.status(400).json(err_data);
  }
}

exports.get_execution = async function(args, res, next) {
  /**
   * Get meta data of an execution
   *
   * execution_id String unique id of execution
   * returns ExecutionInfo
   **/

  let execution_id = args['execution_id']['value'];

  try {
    const data = await node_funcs.getExecutionFull(execution_id);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting an execution', err);
    res.status(400).json(err_data);
  }
}

exports.get_execution_as_run = async function(args, res, next) {
  /**
   * Get as run report for an execution
   *
   * execution_id String unique id of execution
   * offset Integer Start index for pagination. zero based. (optional)
   * limit Integer Max number of elements to return. (optional)
   * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
   * returns ExecutionAsRun
   **/

  let execution_id = args['execution_id']['value'];
  // TODO: handle offset, limit, and sort

  try {
    const data = await node_funcs.getAsRun('execution/' + execution_id);
    base_funcs.sanitizeElement(data);
    base_funcs.sanitize_internal_attrs_recursive(data);
    res.status(200).json(data)
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting execution AS RUN', err);
    res.status(400).json(err_data);
  }
}

exports.get_execution_elements = async function(args, res, next) {
  /**
   * Get elements of the specified type from execution. List is sorted by the order in the execution.
   *
   * execution_id String unique id of execution
   * elem_type String type of procedure element. If omitted, get all types. (optional)
   * step_type String type of step. If omitted, get all types. (optional)
   * offset Integer Start index for pagination. zero based. (optional)
   * limit Integer Max number of elements to return. (optional)
   * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
   * description String Query for words in description (optional)
   * all_elements String include all elements regardless of comments (ON/OFF, ON by default)
   * comment_filter String include elements with general comments (ON/OFF, OFF by default)
   * ar_comment_filter String include elements with activity report comments (ON/OFF, OFF by default)
   * dr_comment_filter String include elements with data review comments (ON/OFF, OFF by default)
   * returns List
   **/

  let execution_id = args['execution_id']['value'];
  let elem_type = args['elem_type']['value'] || null;
  let step_type = args['step_type']['value'] || null;
  let offset = args['offset']['value'] || 0;
	let limit = args['limit']['value'] || 50;
	let sort = args["sort"]['value'] || 'ASC';
  let description = args["description"]["value"] || null;
  let all_elements = args["all_elements"]["value"] === 'ON';
  let comment_filter = args["comment_filter"]["value"] === 'ON';
  let ar_comment_filter = args["ar_comment_filter"]["value"] === 'ON';
  let dr_comment_filter = args["dr_comment_filter"]["value"] === 'ON';
  
  let execution_idd = 'execution/' + execution_id;

  try {
    const data = await base_funcs.getElements('EXECUTION', execution_idd, elem_type, step_type, description,
      all_elements, comment_filter, ar_comment_filter, dr_comment_filter);
    let total_count = data.length;
    res.set('x-total-count', total_count);
    let elems = data.slice(offset, offset+limit);
    if (sort == 'DESC') {
      elems = elems.reverse();
    }

    res.status(200).json(elems);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting execution elements', err);
    res.status(400).json(err_data);
  }
}

exports.get_execution_simple_elements = async function(args, res, next) {
  /**
   * Get elements of execution. List is sorted by the order in the execution. Include inly key fields of element.
   *
   * execution_id String unique id of execution
   **/

  let execution_id = args['execution_id']['value'];  
  let execution_idd = 'execution/' + execution_id;

  try {
    const data = await base_funcs.getSimpleElements('EXECUTION', execution_idd);
    let total_count = data.length;
    res.set('x-total-count', total_count);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting execution simple elements', err);
    res.status(400).json(err_data);
  }
}

exports.update_execution_elements = async function(args, res, next) {
  /**
   * Update elements in an execution
   *
   * execution_id String unique id of execution
   * elems_input elements to update
   * returns array of elements updated
   **/

  let execution_id = args['execution_id']['value'];
  let elems_input = args['elems_input']['value'];

  try {
    const data = await base_funcs.updateElements('EXECUTION', elems_input);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when updating execution elements', err);
    res.status(400).json(err_data);
  }
}

exports.get_execution_outline = async function(args, res, next) {
  /**
   * Get outline view of execution
   *
   * execution_id String unique id of execution
   * returns array of outline elements
   **/

  let execution_id = args['execution_id']['value'];
  let execution_idd = 'execution/' + execution_id;

  try {
    const data = await node_funcs.getOutline(execution_idd);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting execution outline', err);
    res.status(400).json(err_data);
  }
}

exports.get_execution_history = async function(args, res, next) {
  /**
   * Get execution history of steps
   *
   * execution_id String unique id of execution
   * offset Integer Start index for pagination. zero based. (optional)
   * limit Integer Max number of elements to return. (optional)
   * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
   * returns ExecutionHistory
   **/
  let execution_id = args['execution_id']['value'];
  // TODO: handle offset, limit, and sort

  try {
    const data = await node_funcs.getStepExecutionHistory('execution/' + execution_id);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting execution history', err);
    res.status(400).json(err_data);
  }
}


exports.get_execution_status = async function(args, res, next) {
  /**
   * Get the current status of the execution
   *
   * execution_id String unique id of execution
   * returns ExecutionStatus
   **/

  let execution_id = args['execution_id']['value'];

  try {
    const data = await node_funcs.getExecutionStatus(execution_id);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting execution status', err);
    res.status(400).json(err_data);
  }
}

exports.get_execution_steps = async function(args, res, next) {
  /**
   * Get steps of the execution. List is sorted by the order in the execution.
   *
   * execution_id String unique id of execution
   * offset Integer Start index for pagination. zero based. (optional)
   * limit Integer Max number of elements to return. (optional)
   * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
   * description String Query for words in description (optional)
   * returns List
   **/

  let execution_id = args['execution_id']['value'];
  let elem_type = 'STEP';
  let step_type = null;  
  let offset = args['offset']['value'] || 0;
	let limit = args['limit']['value'] || 50;
	let sort = args["sort"]['value'] || 'ASC';
	let description = args["description"]["value"] || null;

  let execution_idd = 'execution/' + execution_id;

  try {
    const data = await base_funcs.getElements('EXECUTION', execution_idd, elem_type, step_type, description);
    let total_count = data.length;
    res.set('x-total-count', total_count);

    let elems = data.slice(offset, offset+limit);

    if (sort == 'DESC') {
      elems = elems.reverse();
    }
    res.status(200).json(elems);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting execution steps', err);
    res.status(400).json(err_data);
  }
}

exports.get_executions = async function(args, res, next) {
  /**
   * Get a list of executions. List is sorted by start date by default (latest first).
   *
   * offset Integer Start index for pagination. zero based. (optional)
   * limit Integer Max number of elements to return. (optional)
   * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
   * completed Boolean Get only completed or not completed executions (optional)
   * description String Query for words in description (optional)
   * returns List
   **/

	let offset = args['offset']['value'] || 0;
	let limit = args['limit']['value'] || 50;
	let sort = args["sort"]['value'] || 'DESC';
	let sort_by = args["sort_by"]["value"] || null;  
  let execution_id = args["execution_id"]["value"] || null;
  let description = args["description"]["value"] || null;
  let status = args["status"]["value"] || null;
  let statuses_str = args["statuses"]["value"] || null;
  let completed = (args["completed"].hasOwnProperty("value") && (args["completed"]["value"] !== undefined)) ? 
    args["completed"]["value"] : null;
  let from_time = args["from_time"]["value"] || null;
  let to_time = args["to_time"]["value"] || null;
  let venue_id = args["venue_id"]["value"] || null;
  let venue_name = args["venue_name"]["value"] || null;
  let venue_type = args["venue_type"]["value"] || null;  
  let run_for_score = (args["run_for_score"].hasOwnProperty("value") && (args["run_for_score"]["value"] !== undefined)) ? 
    args["run_for_score"]["value"] : null;
  let test_conductor = args["test_conductor"]["value"] || null;
  let procedure_id = args["procedure_id"]["value"] || null;
  let version = args["version"]["value"] || null;
  let institutional_id = args["institutional_id"]["value"] || null;
  let institutional_release_id = args["institutional_release_id"]["value"] || null;

  let statuses = [];
  if (status) {
    statuses.push(status);
  }
  if (statuses_str) {
    statuses.push(...statuses_str.split(','));
  }

  try {
    const data = await node_funcs.getExecutions(offset, limit, sort, sort_by, execution_id, description, 
      statuses, completed, 
      from_time, to_time,
      venue_id, venue_name, venue_type,
      run_for_score, test_conductor, procedure_id, version, 
      institutional_id, institutional_release_id);
    let total_count = data['total_count'] || 0;
    res.set('x-total-count', total_count);
    let executions = data['data'];
    executions.forEach(function(execution) {base_funcs.sanitize_internal_attrs(execution)});
    res.status(200).json(executions);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting executions', err);
    res.status(400).json(err_data);
  }
}

exports.move_execution_element = async function(args, res, next) {
  /**
   * Move element in execution
   *
   * execution_id String unique id of execution
   * move_element_input input 
   * returns ElementsNumberResponse
   **/
  let execution_id = args['execution_id']['value'];
  let move_element_input = args['move_element_input']['value'];

  let elem_ids = move_element_input['elem_ids'];
  let insert_after_id = move_element_input['insert_after_id'];
  let level = move_element_input['level'];

  try {
    await node_funcs.checkExecutionClosed(execution_id, 'Execution has been closed. Cannot move the element.');
    const data = await node_funcs.moveElement(execution_id, elem_ids, insert_after_id, level);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when moving an execution element', err);
    res.status(400).json(err_data);
  }
}

exports.copy_execution_element = async function(args, res, next) {
  /**
   * Copy element in execution
   *
   * execution_id String unique id of execution
   * copy_element_input input 
   * returns CopyElementResponse
   **/
  let execution_id = args['execution_id']['value'];
  let copy_element_input = args['copy_element_input']['value'];

  let elem_ids = copy_element_input['elem_ids'];
  let insert_after_id = copy_element_input['insert_after_id'];
  let level = copy_element_input['level'];

  let source_execution_id = copy_element_input['source_execution_id'] || null;
  let source_procedure_id = copy_element_input['source_procedure_id'] || null;
  let source_procedure_version = copy_element_input.hasOwnProperty('source_procedure_version') ? 
    copy_element_input['source_procedure_version'] : null;

  try {
    await node_funcs.checkExecutionClosed(execution_id, 'Execution has been closed. Cannot copy the element.');
    const data = await node_funcs.copyElement(execution_id, elem_ids, insert_after_id, level, 
      source_execution_id, source_procedure_id, source_procedure_version);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when copying an execution element', err);
    res.status(400).json(err_data);
  }
}

exports.execution_get_element = async function(args, res, next) {
  /**
   * Get an element in execution
   *
   * elem_id String unique id of an element
   * returns 
   **/
  let execution_id = args['execution_id']['value'];
  let elem_id = args['elem_id']['value'];

  try {
    const data = await node_funcs.getElement(elem_id);
    base_funcs.sanitize_internal_attrs(data);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting an execution element', err);
    res.status(400).json(err_data);
  }
}

exports.execution_update_element = async function(args, res, next) {
  /**
   * Update an element in execution
   *
   * elem_id String unique id of an element
   * elem_input element data
   * returns 
   **/
  let execution_id = args['execution_id']['value'];
  let elem_id = args['elem_id']['value'];
  let elem_input = args['elem_input']['value'];
  
  try {
    await node_funcs.checkExecutionClosed(execution_id, 'Execution has been closed. Cannot change the element.');
    const data = await node_funcs.updateElement(elem_id, elem_input);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when updating an execution element', err);
    res.status(400).json(err_data);
  }
}

exports.execution_delete_element = async function(args, res, next) {
  /**
   * Delete an element from execution
   *
   * elem_id String unique id of an element
   * returns ElementsNumberResponse
   **/
  let execution_id = args['execution_id']['value'];
  let elem_id = args['elem_id']['value'];

  try {
    await node_funcs.checkExecutionClosed(execution_id, 'Execution has been closed. Cannot delete the element.');
    const data = await node_funcs.deleteElement(elem_id, false);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when deleting an execution element', err);
    res.status(400).json(err_data);
  }
}

exports.execution_modify_element = async function(args, res, next) {
  /**
   * modify an element to create a redline/blueline
   *
   * elem_id String unique id of an element
   * returns ModifyElementResponse
   **/
  let execution_id = args['execution_id']['value'];
  let elem_id = args['elem_id']['value'];

  try {
    await node_funcs.checkExecutionClosed(execution_id, 'Execution has been closed. Cannot modify the element.');
    const data = await node_funcs.modifyElement(execution_id, elem_id); 
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when modifying an execution element', err);
    res.status(400).json(err_data);
  }
}

exports.execution_discard_element = async function(args, res, next) {
  /**
   * discard a redline/blueline element
   * execution_id String unique id of the execution
   * elem_id String unique id of an element
   * returns DiscardElementResponse
   **/
  let execution_id = args['execution_id']['value'];
  let elem_id = args['elem_id']['value'];

  try {
    await node_funcs.checkExecutionClosed(execution_id, 'Execution has been closed. Cannot discard the element.');
    const data = await node_funcs.discardElements(execution_id, [elem_id]);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when discarding an execution element', err);
    res.status(400).json(err_data);
  }
}

exports.execution_discard_elements = async function(args, res, next) {
  /**
   * bulk discard redline/blueline elements
   * execution_id String unique id of the execution
   * returns DiscardElementResponse
   **/
  let execution_id = args['execution_id']['value'];
  let discard_input = args['discard_input']['value'];

  try {
    await node_funcs.checkExecutionClosed(execution_id, 'Execution has been closed. Cannot discard the element.');
    let elem_ids = discard_input.elem_ids;
    const data = await node_funcs.discardElements(execution_id, elem_ids);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when discarding an execution element', err);
    res.status(400).json(err_data);
  }
}

exports.update_execution = async function(args, res, next) {
  /**
   * Update meta data of an execution
   *
   * execution_id String unique id of execution
   * execution_meta_data ExecutionInfo meta data of execution
   * no response value expected for this operation
   **/

  let execution_id = args['execution_id']['value'];
  let execution_meta_data = args['execution_meta_data']['value'];

  try {
    const data = await node_funcs.updateExecution(execution_id, execution_meta_data);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when updating an execution', err);
    res.status(400).json(err_data);
  }
}

exports.update_execution_status = async function(args, res, next, headers) {
  /**
   * Update the current status of the execution
   *
   * execution_id String unique id of execution
   * execution_status ExecutionStatus status of the execution
   * no response value expected for this operation
   **/
  let execution_id = args['execution_id']['value'];
  let execution_status = args['execution_status']['value'];
  let user_name = base_funcs.getUserName(headers['authorization']);
  
  try {
    const execution = await node_funcs.updateExecutionStatus(execution_id, execution_status, user_name);
    res.status(200).json(execution);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when updating execution status', err);
    res.status(400).json(err_data);
  }
}

exports.get_next_element = async function(args, res, next) {
  /**
   * Get the element next to the specified element
   *
   * execution_id String unique id of execution
   * elem_id String id of the reference element
   * executable boolean true if only executable elements are considered
   * 
   * return elem info
   **/
  let execution_id = args['execution_id']['value'];
  let elem_id = args['elem_id']['value'];
  let executable = args['executable']['value'];

  try {
    const step = await node_funcs.getNextElement(execution_id, elem_id, executable);
    if (step) {
      res.status(200).json(step);
    } else {
      // step may be null if next step is not found
      res.status(404).end();
    }
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting the next execution element', err);
    res.status(400).json(err_data);
  }
}

exports.set_boundary_element = async function(args, res, next) {
  /**
   * Set the boundary element to determine the scope of AUTO execution
   *
   * execution_id String unique id of execution
   * elem_id String id of the element for which execution starts
   * 
   * return elem info
   **/
  let execution_id = args['execution_id']['value'];
  let elem_id = args['elem_id']['value'];

  try {
    const execution = await node_funcs.setExecutionBoundary(execution_id, elem_id);
    if (execution) {
      res.status(200).json(execution);
    } else {
      // step may be null if next step is not found
      res.status(404).end();
    }
  } catch(err) {
    const err_data = base_funcs.push_error('Error when setting execution boundary element', err);
    res.status(400).json(err_data);
  }
}

exports.export_execution = async function(args, res, next) {
  /**
   * Export an execution
   *
   * return ExecutionData
   **/
  let execution_id = args['execution_id']['value'];

  try {
    const data = await node_funcs.exportExecution(execution_id);
    res.status(200).json(data);
  } catch (err) {
    const err_data = base_funcs.push_error('Error when exporting an execution', err);
    res.status(400).json(err_data);
  }
}

exports.import_execution = async function(args, res, next) {

  /**
  * Import execution, elements and edges

  * import_input: (object) execution, elements and edges
  * returns: None

  **/
  let import_input = args['import_input']['value'];

  try {
    const data = await node_funcs.importExecution(import_input);
    res.status(200).json(data);
  } catch (err) {
    const err_data = base_funcs.push_error('Error when importing execution', err);
    res.status(400).json(err_data);
  }   
}