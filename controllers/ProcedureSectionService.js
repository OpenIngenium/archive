'use strict';

var base_funcs = require('../api/base_funcs');
var procedure_funcs = require('../api/procedure_funcs');

var log = base_funcs.log;

exports.procedure_create_section = async function(args, res, next) {
  /**
   * Create a section
   *
   * procedure_id String unique id of procedure
   * section Section section definition
   * insert_after_id String unique id of the element after which element(s) will be added/inserted. If not provided, element will be added/inserted to the last. To insert at the front, use \"-1\". (optional)
   * level String Add as a sibling or a child.  * `SIBLING` - As a sibling of insert_after_id element (Default) * `CHILD` - As a child of insert_after_element  (optional)
   * returns AddSectionResponse
   **/  

  let procedure_id = args['procedure_id']['value'];
  let section = args['section']['value'];
  let insert_after_id = args['insert_after_id']['value'];
  let level = args['level']['value'];

  try {
    const data = await procedure_funcs.addElement(procedure_id, section, insert_after_id, level);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when adding a section to a procedure', err);
    res.status(400).json(err_data);
  }
}


exports.procedure_get_section = async function(args, res, next) {
  /**
   * Get section definition
   *
   * procedure_id String unique id of procedure
   * elem_id String unique id of a procedure element
   * returns Section
   **/  
  let elem_id = args['elem_id']['value'];

  try {
    const data = await procedure_funcs.getElement(elem_id)
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting a section from a procedure', err);
    res.status(400).json(err_data);
  }
}



exports.procedure_get_sections = async function(args, res, next) {
  /**
   * Get sections of the procedure. List is sorted by the order in the procedure.
   *
   * procedure_id String unique id of procedure
   * offset Integer Start index for pagination. zero based. (optional)
   * limit Integer Max number of elements to return. (optional)
   * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
   * description String Query for words in description (optional)
   * returns List
   **/  
  let procedure_id = args['procedure_id']['value'];
  let elem_type = 'SECTION';
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
    const err_data = base_funcs.push_error('Error when getting sections from a procedure', err);
    res.status(400).json(err_data);
  }
}



exports.procedure_update_section = async function(args, res, next) {
  /**
   * Update a section
   *
   * procedure_id String unique id of procedure
   * elem_id String unique id of a procedure element
   * section Section Definition of section
   * no response value expected for this operation
   **/  
  let procedure_id = args['procedure_id']['value'];
  let elem_id = args['elem_id']['value'];
  let section = args['section']['value'];

  try {
    await procedure_funcs.checkElementVersioned(procedure_id, elem_id, 'Cannot modify element of versioned procedure');    
    const data = await procedure_funcs.updateElement(procedure_id, elem_id, section);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when updating a section of procedure', err);
    res.status(400).json(err_data);
  }
}

