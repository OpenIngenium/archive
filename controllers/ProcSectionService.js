'use strict';
var extend = require('extend');
var base_funcs = require('../api/base_funcs');
var procedure_funcs = require('../api/procedure_funcs');
var node_funcs = require('../api/node_funcs');
var util = require('util');
var log = base_funcs.log;

/**
 * Create a procedure section
 *
 * execution_id String unique id of execution
 * procedure_section ProcedureSection procedure section definition
 * insert_after_id String unique id of the element after which element(s) will be added/inserted. If not provided, element will be added/inserted to the last. To insert at the front, use \"-1\". (optional)
 * level String Add as a sibling or a child.  * `SIBLING` - As a sibling of insert_after_id element (Default) * `CHILD` - As a child of insert_after_element  (optional)
 * returns AddProcedureSectionResponse
 **/
exports.create_procedure_section = async function(args, res, next) {
  let execution_id = args['execution_id']['value'];
  let procedure_section = args['procedure_section']['value'];
  let insert_after_id = args['insert_after_id']['value'];
  let level = args['level']['value'];

  try {
    await node_funcs.checkExecutionClosed(execution_id, 'Execution has been closed. Cannot add an element.');
    
    const execution_user_input = procedure_section.hasOwnProperty('execution_user_input') ? 
      procedure_section['execution_user_input'] : {};
    
    // if run_for_score was not specified, use true for ATLO venue
    const venue_type = await node_funcs.getVenueTypeForExecution(execution_id);

    if (venue_type === 'ATLO' || venue_type === 'Testbed') {
      execution_user_input['run_for_score'] = true;
    } else {
      execution_user_input['run_for_score'] = false;
    }
    
    procedure_section['execution_user_input'] = execution_user_input;

    const data = await node_funcs.addElement(execution_id, procedure_section, insert_after_id, level);
    res.status(200).json(data);
  } catch (err) {
    const err_data = base_funcs.push_error('Error when creating a procedure section', err);
    res.status(400).json(err_data);
  }
}


/**
 * Get procedure sections of the execution. List is sorted by the order in the execution.
 *
 * execution_id String unique id of execution
 * offset Integer Start index for pagination. zero based. (optional)
 * limit Integer Max number of elements to return. (optional)
 * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
 * description String Query for words in description (optional)
 * returns List
 **/
exports.get_execution_procedure_sections = async function(args, res, next) {
  let execution_id = args['execution_id']['value'];
  let elem_type = 'PROCEDURE_SECTION';
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
  } catch (err) {
    const err_data = base_funcs.push_error('Error when getting procedure sections', err);
    res.status(400).json(err_data);
  }
}


/**
 * Get procedure section definition
 *
 * elem_id String unique id of a procedure element
 * returns ProcedureSection
 **/
exports.get_procedure_section = async function(args, res, next) {
  let elem_id = args['elem_id']['value'];

  try {
    const data = await node_funcs.getElement(elem_id);
    res.status(200).json(data);  
  } catch (err) {
    const err_data = base_funcs.push_error('Error when getting a procedure section', err);
    res.status(400).json(err_data);
  }
}


exports.get_procedure_section_structure = async function(args, res, next) {
  /**
   * Get structure of the selected procedure elements
   *
   * elem_id String unique id of a procedure element
   * returns ProcedureStructure
   **/
  
  let elem_id = args['elem_id']['value'];
  
  try {
    const data = await procedure_funcs.getProcedureSectionStructure('EXECUTION', elem_id);
    base_funcs.sanitizeElement(data);
    base_funcs.sanitize_internal_attrs_recursive(data);    
    res.status(200).json(data);    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when getting elements structure of a procedure section', err);
    res.status(400).json(err_data);
  }  
}

exports.get_procedure_section_elements = async function(args, res, next) {
  /**
   * Get selected procedure elements
   *
   * elem_id String unique id of a procedure element
   * returns array of ProcedureElement
   **/
  
  let elem_id = args['elem_id']['value'];

  try {
    const data = await procedure_funcs.getProcedureSectionStructure('EXECUTION', elem_id);
    let elems = [];
    base_funcs.collectElements(data, elems);
    for (let i=0; i < elems.length; i++) {
      base_funcs.sanitizeElement(elems[i]);
      base_funcs.sanitize_internal_attrs(elems[i]);    
    }

    res.status(200).json(elems);
  } catch (err) {
    const err_data = base_funcs.push_error('Error when getting elements of a procedure section', err);
    res.status(400).json(err_data);
  }
}

exports.import_procedure_section = async function(args, res, next) {
  /**
   * Import elements from the referenced procedure
   * execution_id String unique id of execution
   * elem_id String unique id of a procedure element
   * returns ProcedureStructure
   **/
  
  let execution_id = args['execution_id']['value'];
  let elem_id = args['elem_id']['value'];

  try {
    const data = await node_funcs.importProcedureSection(elem_id);
    await node_funcs.updateUsedProcedures(execution_id);
    base_funcs.sanitizeElement(data);
    base_funcs.sanitize_internal_attrs_recursive(data);
    res.status(200).json(data)
  } catch (err) {
    const err_data = base_funcs.push_error(`Error when importing a procedure for a procedure. ${err}`, err);
    res.status(400).json(err_data);
  }
}


/**
 * Update a procedure section
 *
 * elem_id String unique id of a procedure element
 * procedure_section ProcedureSection Definition of procedure section
 * no response value expected for this operation
 **/
exports.update_procedure_section = async function(args, res, next) {
  let elem_id = args['elem_id']['value'];
  let procedure_section = args['procedure_section']['value'];

  try {
    const data = await node_funcs.updateElement(elem_id, procedure_section);
    res.status(200).json(data);    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when updating a procedure section', err);
    res.status(400).json(err_data);
  }
}

/**
 * Get procedure section input (execution time)
 *
 * elem_id String unique id of a procedure element
 * returns ProcedureSectionInput
 **/
exports.get_procedure_section_input = async function(args, res, next) {
  let elem_id = args['elem_id']['value'];

  try {
    const data = await node_funcs.getElement(elem_id);
    res.status(200).json(data['execution_user_input']);
  } catch (err) {
    const err_data = base_funcs.push_error('Error when getting input of procedure section', err);
    res.status(400).json(err_data);
  }
}

/**
 * Update a procedure section input (execution time)
 *
 * elem_id String unique id of a procedure element
 * user_input ProcedureSectionInput user input
 * no response value expected for this operation
 **/
exports.update_procedure_section_input = async function(args, res, next) {
  let elem_id = args['elem_id']['value'];
  let user_input = args['user_input']['value'];

  try {
    const data = await node_funcs.updateElement(elem_id, {'execution_user_input': user_input});
    res.status(204).end();    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when updating input of a procedure section', err);
    res.status(400).json(err_data);
  }
}