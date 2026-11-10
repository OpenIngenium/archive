'use strict';

var base_funcs = require('../api/base_funcs');
var procedure_funcs = require('../api/procedure_funcs');

var log = base_funcs.log;


exports.procedure_create_paragraph = async function(args, res, next) {
  /**
   * Create a paragraph
   *
   * procedure_id String unique id of procedure
   * paragraph Paragraph paragraph definition
   * insert_after_id String unique id of the element after which element(s) will be added/inserted. If not provided, element will be added/inserted to the last. To insert at the front, use \"-1\". (optional)
   * level String Add as a sibling or a child.  * `SIBLING` - As a sibling of insert_after_id element (Default) * `CHILD` - As a child of insert_after_element  (optional)
   * returns AddParagraphResponse
   **/  
  
  let procedure_id = args['procedure_id']['value'];
  let paragraph = args['paragraph']['value'];
  let insert_after_id = args['insert_after_id']['value'];
  let level = args['level']['value'];

  try {
    const data = await procedure_funcs.addElement(procedure_id, paragraph, insert_after_id, level);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when adding a paragraph to a procedure', err);
    res.status(400).json(err_data);
  }
}


exports.procedure_get_paragraph = async function(args, res, next) {
  /**
   * Get paragraph definition
   *
   * procedure_id String unique id of procedure
   * elem_id String unique id of a procedure element
   * returns Paragraph
   **/  
  
  let elem_id = args['elem_id']['value'];

  try {
    const data = await procedure_funcs.getElement(elem_id);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when getting a paragraph of a procedure', err);
    res.status(400).json(err_data);
  }
}



exports.procedure_get_paragraphs = async function(args, res, next) {
  /**
   * Get paragraphs of the execution. List is sorted by the order in the execution.
   *
   * procedure_id String unique id of procedure
   * offset Integer Start index for pagination. zero based. (optional)
   * limit Integer Max number of elements to return. (optional)
   * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
   * description String Query for words in description (optional)
   * returns List
   **/  
  
  let procedure_id = args['procedure_id']['value'];
  let elem_type = 'PARAGRAPH';
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
    const err_data = base_funcs.push_error('Error when getting paragraphs of a procedure', err);
    res.status(400).json(err_data);
  } 
}



exports.procedure_update_paragraph = async function(args, res, next) {
  /**
   * Update a paragraph
   *
   * procedure_id String unique id of procedure
   * elem_id String unique id of a procedure element
   * paragraph Paragraph Definition of paragraph
   * no response value expected for this operation
   **/  
  let procedure_id = args['procedure_id']['value'];
  let elem_id = args['elem_id']['value'];
  let paragraph = args['paragraph']['value'];

  try {
    await procedure_funcs.checkElementVersioned(procedure_id, elem_id, 'Cannot modify element of versioned procedure');    
    const data = await procedure_funcs.updateElement(procedure_id, elem_id, paragraph);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when updating a procedure paragraph', err);
    res.status(400).json(err_data);
  }
}

