'use strict';
var base_funcs = require('../api/base_funcs');
var procedure_funcs = require('../api/procedure_funcs');
var log = base_funcs.log;


exports.create_version = async function(args, res, next) {
  /**
   * Create a new version from the current working copy
   *
   * procedure_id String unique id of procedure
   * version_meta_data ProcedureVersionInput meta data of version
   * returns ProcedureVersionInfo
   **/  
  
  let procedure_id = args['procedure_id']['value'];  
  let version_meta_data = args['version_meta_data']['value'];
  
  try {
    const procedure_doc = await procedure_funcs.getProcedure(procedure_id);
    const working_version = await procedure_funcs.getProcedureVersion(procedure_id, 0);
    const data = await procedure_funcs.createProcedureVersion(procedure_doc, version_meta_data, working_version);
    res.status(200).json(base_funcs.sanitize_internal_attrs(data));
  } catch (err) {
    const err_data = base_funcs.push_error('Error when creating a version of a procedure', err);
    res.status(400).json(err_data);
  }
}


exports.delete_version = async function(args, res, next) {
  /**
   * Delete the version
   *
   * procedure_id String unique id of procedure
   * version Integer version of procedure
   * no response value expected for this operation
   **/  
  let procedure_id = args['procedure_id']['value'];
  let version = args['version']['value'];

  try {
    const data = await procedure_funcs.deleteProcedureVersion(procedure_id, version, false);
    res.status(204).end();    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when deleting a version of procedure', err);
    res.status(400).json(err_data);
  }
}


exports.get_version = async function(args, res, next) {
  /**
   * Get meta data of version of the procedure
   *
   * procedure_id String unique id of procedure
   * version Integer version of procedure
   * returns ProcedureVersionInfo
   **/  
  let procedure_id = args['procedure_id']['value'];
  let version = args['version']['value'];

  try {
    const data = await procedure_funcs.getProcedureVersion(procedure_id, version);
    res.status(200).json(base_funcs.sanitize_internal_attrs(data));
  } catch (err) {
    const err_data = base_funcs.push_error('Error when getting a version of procedure', err);
    res.status(400).json(err_data);
  }
}


exports.get_version_structure = async function(args, res, next) {
  /**
   * Get hierarchical view of the version of the procedure
   *
   * procedure_id String unique id of procedure
   * version Integer version of procedure
   * offset Integer Start index for pagination. zero based. (optional)
   * limit Integer Max number of elements to return. (optional)
   * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
   * returns ProcedureStructure
   **/  
  let procedure_id = args['procedure_id']['value'];
  let version = args['version']['value'];
  
  try {
    const version_id = await procedure_funcs.getProcedureVersionId(procedure_id, version);
    const data = await procedure_funcs.getStructure('procedureVersion/' + version_id, false);
    base_funcs.sanitizeElement(data);
    base_funcs.sanitize_internal_attrs_recursive(data);        
    res.status(200).json(data)
  } catch (err) {
    const err_data = base_funcs.push_error('Error when getting element structure of a version of a procedure', err);
    res.status(400).json(err_data);
  }
}

exports.get_version_elements = async function(args, res, next) {
  /**
   * Get elements the version of the procedure
   *
   * procedure_id String unique id of procedure
   * version Integer version of procedure 
   * elem_type String type of procedure element. If omitted, get all types. (optional)
   * step_type String type of step. If omitted, get all types. (optional)
   * offset Integer Start index for pagination. zero based. (optional)
   * limit Integer Max number of elements to return. (optional)
   * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
   * description String Query for words in description (optional)
   * 
   * returns List
   **/  
  let procedure_id = args['procedure_id']['value'];
  let version = args['version']['value'];
  let elem_type = args['elem_type']['value'] || null;
  let step_type = args['step_type']['value'] || null;
  let offset = args['offset']['value'] || 0;
  let limit = args['limit']['value'] || 50;
  let sort = args["sort"]['value'] || 'ASC';
  let description = args["description"]["value"] || null;  
  let all_elements = args["all_elements"]["value"] === 'ON';
  let comment_filter = args["comment_filter"]["value"] === 'ON';

  try {
    const version_id = await procedure_funcs.getProcedureVersionId(procedure_id, version);
    const data = await procedure_funcs.getElements('procedureVersion/' + version_id,
      elem_type, step_type, description,
      all_elements, comment_filter);
    let total_count = data.length;
    res.set('x-total-count', total_count);
    let elems = data.slice(offset, offset+limit);
    if (sort == 'DESC') {
      elems = elems.reverse();
    }
    res.status(200).json(elems);
  } catch (err) {
    const err_data = base_funcs.push_error('Error when getting elements of a version of a procedure', err);
    res.status(400).json(err_data);
  }
}

exports.get_version_outline = async function(args, res, next) {
  /**
   * Get outline view of the version of the procedure
   *
   * procedure_id String unique id of procedure
   * version Integer version of procedure
   * tag_ids ids of selected tags (comma separated list)
   * returns ProcedureStructureReference
   **/  
  let procedure_id = args['procedure_id']['value'];
  let version = args['version']['value'];
  let tag_ids_str = args['tag_ids']['value'];
  
  try {
    const version_id = await procedure_funcs.getProcedureVersionId(procedure_id, version);
    const tag_ids = tag_ids_str ? tag_ids_str.split(',').map((value) => value.trim()) : [];
    const data = await procedure_funcs.getOutline('procedureVersion/' + version_id, tag_ids);
    res.status(200).json(data);
  } catch (err) {
    const err_data = base_funcs.push_error('Error when getting outline of a version of a procedure', err);
    res.status(400).json(err_data);
  }
}

exports.get_versions = async function(args, res, next) {
  /**
   * Get a list of versions. List is sorted by time versioned (latest first). 
   *
   * procedure_id String unique id of procedure
   * offset Integer Start index for pagination. zero based. (optional)
   * limit Integer Max number of elements to return. (optional)
   * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
   * version_description String Query for words in procedure version description (optional)
   * version_author String Query for words in version author (optional)  
   * status String filter based on version status. (optional)
   * returns List
   **/  
  let procedure_id = args['procedure_id']['value'];  
  let offset = args['offset']['value'] || 0;
  let limit = args['limit']['value'] || 50;
  let sort = args["sort"]['value'] || 'DESC';  
  let version_description = args["version_description"]['value'] || null;  
  let institutional_release_id = args["institutional_release_id"]['value'] || null;  
  let version_author = args["version_author"]['value'] || null;  
  let status = args["status"]['value'] || null; 
  let sort_by = args['sort_by']['value'] || 'TIME_VERSIONED';
  
  try {
    const result = await procedure_funcs.getProcedureVersions(procedure_id, offset, limit, version_description, 
      institutional_release_id, version_author, status, sort, sort_by);
    let total_count = result['total_count'] || 0;
    res.set('x-total-count', total_count);

    if (result.data) {
      for (let i = 0; i < result.data.length; i++) {
        base_funcs.sanitize_internal_attrs(result.data[i]);
      }
    }

    res.status(200).json(result.data);
  } catch (err) {
    const err_data = base_funcs.push_error('Error when getting versions of a procedure', err);
    res.status(400).json(err_data);
  }
}


exports.update_version = async function(args, res, next) {
  /**
   * Update meta data of the version
   *
   * procedure_id String unique id of procedure
   * version Integer version of procedure
   * version_meta_data ProcedureVersionUpdateInput meta data of version
   * returns ProcedureVersionInfo
   **/  
  let procedure_id = args['procedure_id']['value'];
  let version = args['version']['value'];
  let version_meta_data = args['version_meta_data']['value'];

  try {
    const data = await procedure_funcs.updateProcedureVersion(procedure_id, version, version_meta_data);
    res.status(200).json(data);    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when updating meta data of a procedure version', err);
    res.status(400).json(err_data);
  }
}

exports.update_version_status = async function(args, res, next) {
  /**
   * Update meta data of the version
   *
   * procedure_id String unique id of procedure
   * version Integer version of procedure
   * version_status_input ProcedureVersionStatusInput version status input
   * returns ProcedureVersionInfo
   **/  
  let procedure_id = args['procedure_id']['value'];
  let version = args['version']['value'];
  let version_status_input = args['version_status_input']['value'];

  try {
    const data = await procedure_funcs.updateProcedureVersionStatus(procedure_id, version, version_status_input);
    res.status(200).json(data);    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when updating status of a procedure version', err);
    res.status(400).json(err_data);
  }
}

