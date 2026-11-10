'use strict';
var base_funcs = require('../api/base_funcs');
var node_funcs = require('../api/node_funcs');
var procedure_funcs = require('../api/procedure_funcs');
var log = base_funcs.log;

exports.get_procedures = async function(args, res, next) {

  /**
  * Get a list of procedures. List is sorted by creation time (latest first)

  * offset: (integer) Start index for pagination. zero based.
  * limit: (integer) Max numbers of elements to return.
  * title: (string) filter by title.
  * author: (string) filter by author
  * versioned: (boolean) filter based on current_version  
  * procedure_type (string) Procedure Type of a procedure
  * hazardous (boolean) filter for procedure 
  * label (string) Label for procedure
  * released: (boolean) filter based on released_version
  * obsolete: (boolean) filter on obsolete status
  * sort: (string) Sort in natural order.
  * sort_by: (string) Sort by TIME_CREATED, TIME_SAVED, etc.

  * returns: (list) a list of procedure objects
  **/

  let offset = args['offset']['value'] || 0;
	let limit = args['limit']['value'] || 50;
  let title = args["title"]["value"] || null;
  let description = args["description"]["value"] || null;  
  let procedure_id = args["procedure_id"]["value"] || null; 
  let institutional_id = args["institutional_id"]["value"] || null;   
  let author = args["author"]["value"] || null;
  let versioned = (args["versioned"].hasOwnProperty("value") && (args["versioned"]["value"] !== undefined)) ? args["versioned"]["value"] : null;
  let procedure_type = (args["procedure_type"].hasOwnProperty("value") && (args["procedure_type"]["value"] !== undefined)) ? args["procedure_type"]["value"] : null;
  let hazardous = (args["hazardous"].hasOwnProperty("value") && (args["hazardous"]["value"] !== undefined)) ? args["hazardous"]["value"] : null;
  let label = (args["label"].hasOwnProperty("value") && (args["label"]["value"] !== undefined)) ? args["label"]["value"] : null;
  let released = (args["released"].hasOwnProperty("value") && (args["released"]["value"] !== undefined)) ? args["released"]["value"] : null;
  let obsolete = (args["obsolete"].hasOwnProperty("value") && (args["obsolete"]["value"] !== undefined)) ? args["obsolete"]["value"] : null;
	let sort = args["sort"]['value'] || 'DESC';
  let sort_by = args['sort_by']['value'] || 'TIME_CREATED';
  sort_by = sort_by.toLowerCase();


  try {
    const data = await procedure_funcs.getProcedures(offset, limit, title, description, procedure_id, institutional_id,
      author, versioned, procedure_type, hazardous, label, released, obsolete, sort, sort_by);
    let total_count = data['total_count'] || 0;
    res.set('x-total-count', total_count);
    res.status(200).json(data['data']);
  } catch (err) {
    const err_data = base_funcs.push_error('Error when getting procedures', err);
    res.status(400).json(err_data);
  }
}

exports.import_procedure_versions = async function(args, res, next) {

  /**
  * Import procedure, versions, elements and edges

  * import_input: (object) procedure, versions, elements and edges
  * returns: None

  **/
  let import_input = args['import_input']['value'];

  try {
    const data = await procedure_funcs.importProcedureVersions(import_input);
    res.status(200).json(data);
  } catch (err) {
    const err_data = base_funcs.push_error('Error when importing procedure', err);
    res.status(400).json(err_data);
  }   
}

exports.create_procedure = async function(args, res, next) {

  /**
  * Create a procedure

  * description: (string) Description string describing procedure
  * returns: (object) Information regarding the created object.

  **/
  let procedure = args['procedure']['value'] || null;

  try {
    const data = await procedure_funcs.createProcedure(procedure);
    res.status(200).json(data);    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when creating a procedure', err);
    res.status(400).json(err_data);
  }
}

exports.get_procedure = async function(args, res, next) {

  /**
  * Get metadata of the working copy of a procedure

  * procedure_id: (string) unique id of procedure
  * returns: (object) Information regarding the queried procedure

  **/

  let procedure_id = args['procedure_id']['value'];

  try {
    const data = await procedure_funcs.getProcedure(procedure_id);
    res.status(200).json(base_funcs.sanitize_internal_attrs(data));    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when getting a procedure', err);
    res.status(400).json(err_data);
  }
}

exports.update_procedure = async function(args, res, next) {

  /**
  * Update metadata of the working copy of a procedure

  * procedure_id: (string) unique id of procedure
  * procedure_meta_data: (object) updated procedure metadata

  * returns: None

  **/

  let procedure_id = args['procedure_id']['value'];
  let procedure_meta_data = args['procedure_meta_data']['value'];

  try {
    const data = await procedure_funcs.updateProcedure(procedure_id, procedure_meta_data);
    res.status(204).end();    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when updating procedure meta data', err);
    res.status(400).json(err_data);
  }
}

exports.delete_procedure = async function(args, res, next) {

  /**
  * Delete the procedure and all its versions

  * procedure_id: (string) unique id of procedure
  * returns: None

  **/

  let procedure_id = args['procedure_id']['value'];

  try {
    const data = await procedure_funcs.deleteProcedure(procedure_id);
    res.status(204).end();    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when deleting a procedure', err);
    res.status(400).json(err_data);
  }
}

exports.delete_procedure_label = async function(args, res, next) {
  /**
   * Delete the procedure label 
   *
   * label_id: (string) unique id of procedure label
   * no response value expected for this operation
   **/

  let label_id = args['label_id']['value'];

  try {
    const data = await procedure_funcs.deleteProcedureLabel(label_id); 
    res.status(204).end();
  } catch (err) {
    const err_data = base_funcs.push_error('Error when deleting a procedure', err);
    res.status(400).json(err_data);    
  }
}

exports.create_procedure_label = async function(args, res, next) {
  /**
   * Create a procedure label
   *
   * create_procedure_label ProcedureLabelInput Procedure label data
   * returns ProcedureLabelInfo
   **/

  let procedure_label = args['procedure_label']['value'] || null;

  try {
    const data = await procedure_funcs.createProcedureLabel(procedure_label); 
    res.status(200).json(data);
  } catch (err) {
    const err_data = base_funcs.push_error('Error when creating a procedure', err);
    res.status(400).json(err_data);    
  }
}

exports.get_procedure_labels = async function(args, res, next) {
  /**
   * Get a list of procedure labels. 
   *
   * offset Integer Start index for pagination. zero based. (optional)
   * limit Integer Max number of elements to return. (optional)
   * name String Name of the label (optional)
   * description String description of the label (optional)
   * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
   * returns List
   **/

  let name = args['procedure_label_name']['value'] || null;
  let description = args["description"]["value"] || null; 
  let offset = args['offset']['value'] || 0;
  let limit = args['limit']['value'] || 50;
  let sort = args["sort"]['value'] || 'DESC';

  try {
    const data = await node_funcs.getProcedureLabels(offset, limit, sort, name, description);
    let total_count = data['total_count'] || 0;
    res.set('x-total-count', total_count);
    res.status(200).json(data['data']);
  } catch (err) {
    const err_data = base_funcs.push_error('Error when getting procedures', err);
    res.status(400).json(err_data);    
  }  
}
