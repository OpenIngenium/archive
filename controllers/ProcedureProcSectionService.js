'use strict';
var base_funcs = require('../api/base_funcs');
var procedure_funcs = require('../api/procedure_funcs');

var log = base_funcs.log;


/**
 * Create a procedure section
 *
 * procedure_id String unique id of procedure
 * procedure_section ProcedureSection procedure section definition
 * insert_after_id String unique id of the element after which element(s) will be added/inserted. If not provided, element will be added/inserted to the last. To insert at the front, use \"-1\". (optional)
 * level String Add as a sibling or a child.  * `SIBLING` - As a sibling of insert_after_id element (Default) * `CHILD` - As a child of insert_after_element  (optional)
 * returns AddProcedureSectionResponse
 **/
exports.procedure_create_procedure_section = async function(args, res, next) {
  let procedure_id = args['procedure_id']['value'];
  let procedure_section = args['procedure_section']['value'];
  let insert_after_id = args['insert_after_id']['value'];
  let level = args['level']['value'];

  try {
    const data = await procedure_funcs.addElement(procedure_id, procedure_section, insert_after_id, level);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when adding a procedure section to a procedure', err);
    res.status(400).json(err_data);
  }
}


/**
 * Get procedure section definition
 *
 * procedure_id String unique id of procedure
 * elem_id String unique id of a procedure element
 * returns ProcedureSection
 **/
exports.procedure_get_procedure_section = async function(args, res, next) {
  let elem_id = args['elem_id']['value'];

  try {
    const data = await procedure_funcs.getElement(elem_id);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting a procedure section of a procedure', err);
    res.status(400).json(err_data);
  }
}

exports.procedure_get_procedure_section_structure = async function(args, res, next) {
  /**
   * Get structure of the selected procedure elements
   * 
   * procedure_id String unique id of procedure
   * elem_id String unique id of a procedure element
   * returns ProcedureStructure
   **/
  
  let elem_id = args['elem_id']['value'];

  try {
    const data = await procedure_funcs.getProcedureSectionStructure('PROCEDURE', elem_id);
    base_funcs.sanitizeElement(data);
    base_funcs.sanitize_internal_attrs_recursive(data);
    res.status(200).json(data)
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting the struture of a procedure section of a procedure', err);
    res.status(400).json(err_data);
  }
}

exports.procedure_get_procedure_section_elements = async function(args, res, next) {
  /**
   * Get the selected elements of procedure
   * 
   * procedure_id String unique id of procedure
   * elem_id String unique id of a procedure element
   * returns ProcedureStructure
   **/
  
  let elem_id = args['elem_id']['value'];
  
  try {
    const data = await procedure_funcs.getProcedureSectionStructure('PROCEDURE', elem_id);
    let elems = [];
    base_funcs.collectElements(data, elems);
    for (let i=0; i < elems.length; i++) {
      base_funcs.sanitizeElement(elems[i]);
      base_funcs.sanitize_internal_attrs(elems[i]);    
    }
    res.status(200).json(elems);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting selected elements of a procedure', err);
    res.status(400).json(err_data);
  }
}

/**
 * Get procedure sections of the procedure. List is sorted by the order in the procedure.
 *
 * procedure_id String unique id of procedure
 * offset Integer Start index for pagination. zero based. (optional)
 * limit Integer Max number of elements to return. (optional)
 * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
 * description String Query for words in description (optional)
 * returns List
 **/
exports.procedure_get_procedure_sections = async function(args, res, next) {
  let procedure_id = args['procedure_id']['value'];
  let elem_type = 'PROCEDURE_SECTION';
  let step_type = null;
  let offset = args['offset']['value'] || 0;
  let limit = args['limit']['value'] || 50;
  let sort = args["sort"]['value'] || 'ASC';
  let description = args["description"]["value"] || null;

  try {
    const version_id = await procedure_funcs.getProcedureVersionId(procedure_id, 0);
    const data = await procedure_funcs.getElements('procedureVersion/' + version_id,
      elem_type, step_type, description);

    let total_count = data.length;
    res.set('x-total-count', total_count);
    let elems = data.slice(offset, offset+limit);
    if (sort == 'DESC') {
      elems = elems.reverse();
    }
    res.status(200).json(elems);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting procedure sections of a procedure', err);
    res.status(400).json(err_data);
  }
}


/**
 * Update a procedure section
 *
 * procedure_id String unique id of procedure
 * elem_id String unique id of a procedure element
 * procedure_section ProcedureSection Definition of procedure section
 * no response value expected for this operation
 **/
exports.procedure_update_procedure_section = async function(args, res, next) {
  let procedure_id = args['procedure_id']['value'];
  let elem_id = args['elem_id']['value'];
  let procedure_section = args['procedure_section']['value'];

  try {
    await procedure_funcs.checkElementVersioned(procedure_id, elem_id, 'Cannot modify element of versioned procedure');    
    const data = await procedure_funcs.updateElement(procedure_id, elem_id, procedure_section);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when updating a procedure section of a procedure', err);
    res.status(400).json(err_data);
  }
}

/**
 * Get procedure section input (authoring time)
 *
 * procedure_id String unique id of procedure
 * elem_id String unique id of a procedure element
 * returns ProcedureSectionInput
 **/
exports.procedure_get_procedure_section_input = async function(args, res, next) {
  let elem_id = args['elem_id']['value'];

  try {
    const data = await procedure_funcs.getElement(elem_id);
    res.status(200).json(data['authoring_user_input']);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting input of a procedure section of a procedure', err);
    res.status(400).json(err_data);
  }
}

/**
 * Update a procedure section input (authoring time)
 *
 * procedure_id String unique id of procedure
 * elem_id String unique id of a procedure element
 * user_input ProcedureSectionInput user input
 * no response value expected for this operation
 **/
exports.procedure_update_procedure_section_input = async function(args, res, next) {
  let procedure_id = args['procedure_id']['value'];
  let elem_id = args['elem_id']['value'];
  let user_input = args['user_input']['value'];

  let reference_procedure_id = user_input['reference_procedure_id'];
  let reference_procedure_version = user_input['reference_procedure_version'];
  let reference_elements = user_input['elements'];
  try {
    // If reference_procedure_version is not a valid number, skip the check. 
    // This may be the case if reference_procedure_version has not been selected. 
    if (procedure_id && reference_procedure_id && (reference_procedure_version == 0 || reference_procedure_version > 0)) {
      await procedure_funcs.checkCircularReferenceElem(reference_procedure_id, reference_procedure_version, reference_elements, elem_id);
    }
  } catch (err) {
    let response = {'message': err};
    res.status(400).json(response);
    return;
  }

  try {
    await procedure_funcs.checkElementVersioned(procedure_id, elem_id, 'Cannot modify element of versioned procedure');
    const data = await procedure_funcs.updateElement(procedure_id, elem_id, {'authoring_user_input': user_input});
    res.status(204).end();
  } catch(err) {
    const err_data = base_funcs.push_error('Error when updating procedure section input', err);
    res.status(400).json(err_data);
  }
}