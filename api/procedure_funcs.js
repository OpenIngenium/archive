'use strict'
var uuid = require('uuid');
var deepcopy = require('deepcopy');
var arangojs = require('arangojs');
var extend = require('extend');
var util = require('util');
const removeEmptyLines = require("remove-blank-lines");

var base_funcs = require('./base_funcs');
var definitions = require('../definitions.js');

var config = require('../config.js');

var db = base_funcs.db;
var log = base_funcs.log;
var get_sj_error_message = base_funcs.get_sj_error_message;
var sanitize_internal_attrs = base_funcs.sanitize_internal_attrs;

//Procedure collections
var procedure_element_collection = db.collection(definitions.PROCEDURE_ELEMENT);
var procedure_step_order_collection = db.collection(definitions.PROCEDURE_STEP_ORDER);
var procedure_version_collection = db.collection(definitions.PROCEDURE_VERSION);
var has_version_collection = db.collection(definitions.HAS_VERSION);
var procedure_collection = db.collection(definitions.PROCEDURE);
var procedure_id_gen_collection = db.collection(definitions.PROCEDURE_ID_GEN);   // Used to generate autoincrementing procedure_id
var procedure_label_collection = db.collection(definitions.PROCEDURE_LABEL);

var getProcedureVersionId = async function(procedure_id, version) {
  const version_doc = await getProcedureVersion(procedure_id, version);
  return Promise.resolve(version_doc.version_id);
}

var getProcedures = async function(offset, limit, title, description, procedure_id, institutional_id, 
    author, versioned, procedure_type, hazardous, label, released, obsolete, sort, sort_by) {  
  let offset_limit = '';
  if (offset !== null && limit !== null) {
    offset_limit = `LIMIT ${offset}, ${limit}`  
  } else if (limit !== null) {
    offset_limit = `LIMIT ${limit}` 
  } else if (offset !== null) {
    log.warning('Not allowed to specify only offset in query');
  }

  let title_filter = '';
  if (title !== null) {
    title_filter = `FILTER LIKE(doc.title, "%${title}%", true)`;  
  }
  
  let description_filter = '';
  if (description !== null) {
    description_filter = `FILTER LIKE(doc.description, "%${description}%", true)`;  
  }

  let procedure_id_filter = '';
  if (procedure_id !== null) {
    procedure_id_filter = `FILTER LIKE(doc.procedure_id, "%${procedure_id}%", true)`;  
  }  

  let institutional_id_filter = '';
  if (institutional_id !== null) {
    institutional_id_filter = `FILTER LIKE(doc.institutional_id, "%${institutional_id}%", true)`;  
  }  
  
  let author_filter = '';
  if (author !== null) {
    author_filter = `FILTER LIKE(doc.author, "%${author}%", true)`;  
  }
  
  let versioned_filter = '';
  if (versioned !== null) {
    versioned_filter = versioned ? `FILTER doc.current_version > 0` : `FILTER doc.current_version == 0`;  
  }

  let procedure_type_filter = '';
  if (procedure_type !== null) {
    procedure_type_filter =  `FILTER LIKE(doc.procedure_type, "%${procedure_type}%", true)`;  
  }

  let hazardous_filter = '';
  if (hazardous !== null) {
    hazardous_filter = hazardous ? `FILTER doc.hazardous == true` : `FILTER doc.hazardous == false`;  
  }

  let label_filter = '';
  if (label !== null) {
    label_filter = `FILTER LIKE(doc.labels, "%${label}%", true)`;  
  }
  
  let released_filter = '';
  if (released !== null) {
    released_filter = released ? `FILTER doc.current_released_version > 0` : `FILTER doc.current_released_version == 0`;  
  }
  
  let obsolete_filter = '';
  if (obsolete !== null) {
    obsolete_filter = obsolete ? `FILTER doc.obsolete == true` : `FILTER doc.obsolete == false`;  
  }  
  
  let sort_option = `SORT doc.${sort_by === null ? 'time_created' : sort_by.toLowerCase()} ${sort === null ? 'DESC' : sort}`
  
  // Note: make sure offset_limit is the last filter so that it is applied after other filters have been applied.
  let q_str =
  `
  FOR doc in procedure   
    ${title_filter}
    ${description_filter}
    ${procedure_id_filter}
    ${institutional_id_filter}        
    ${author_filter}
    ${versioned_filter}
    ${procedure_type_filter}
    ${hazardous_filter}
    ${label_filter}
    ${released_filter}
    ${obsolete_filter}
    ${sort_option}
    ${offset_limit}    
    RETURN doc
  `
  q_str = removeEmptyLines(q_str);
  
  log.trace(`getProcedures q_str: ${q_str}`);

  let cursor = null;
  let data = null;
  try {
    cursor = await db.query(q_str, {}, {'count': true, 'fullCount': true});
    data = await cursor.all();
  } catch (err) {
    let msg = 'Failed to get procedures from DB: {0}'.format(get_sj_error_message(err));
    return Promise.reject(msg);
  }

  for (let i = 0; i < data.length; i++) {
    sanitize_internal_attrs(data[i]);
  }
  const fullCount = cursor.extra.stats.hasOwnProperty('fullCount') ? cursor.extra.stats.fullCount : cursor.count;
  return Promise.resolve({'data': data, 'total_count': fullCount});      
}

var createProcedure = async function(procedure_input) {
  let next_procedure_id = null;
  let time_now = new Date(); 
  let res = null;
  try {
    res = await procedure_id_gen_collection.save({}, {'returnNew': true});
  } catch (err) {
    let msg = 'Failed to generate a new procedure id in DB: {0}'.format(get_sj_error_message(err));
    return Promise.reject(msg);
  }

  next_procedure_id = res['new']['_key'];
  log.trace(`next_procedure_id: ${next_procedure_id}`);

  // create procedure 

  let procedure_template = {
    'title': '',        
    'description': '',
    'institutional_id': '',
    'author': '',
    'locked_by': '',
    'obsolete': false,        
    'procedure_id': '',
    'time_created': time_now,
    'current_version': 0, 
    'current_released_version': 0,          
    'time_saved': time_now
  }

  let procedure = extend(true, {}, procedure_template, procedure_input);

  let procedure_id = config.procedure_id_prefix + next_procedure_id;
  procedure['_key'] = procedure_id;
  procedure['procedure_id'] = procedure_id;
  
  try {
    res = await procedure_collection.save(procedure, {'returnNew': true});
  } catch (err) {
    let msg = 'Failed to save procedure in DB: {0}'.format(get_sj_error_message(err));
    return Promise.reject(msg);
  }

  const procedure_doc = res['new'];
  
  await createProcedureVersion(procedure_doc, null, null);

  return Promise.resolve(procedure_doc);
}

/**
 * assign new unique tag ids for procedure version. version_info will be updated in place.
 * @param {object} version_info - procedure version meta data
 * @return {object} map from old id to new id
 */
var _reassignTagIds = function(version_info) {
  const tag_id_map = {};  
  if (version_info.tags) {
    for (const tag of version_info.tags) {
      const new_tag_id = uuid.v4();
      tag_id_map[tag.tag_id] = new_tag_id;
      tag.tag_id = new_tag_id;
    }
  } else {
    // For old procedure version, tags property may not exist. Set to an empty array.
    version_info.tags = [];
  }
  return tag_id_map;
}

/**
 * update tag_ids of procedure elements. elements will be updated in place.
 * @param {array} elements - array of elements
 * @param {object} tag_id_map from old id to new id
 * @return undefined
 */
var _updateTagIds = function(elements, tag_id_map) {    
  for (const element of elements) {
    if (element.tag_ids) {
      const new_tag_ids = element.tag_ids.map(tag_id => tag_id_map[tag_id]);
      element.tag_ids = new_tag_ids;
    } else {
      // For old elements, tag_ids property may not exist. Set to an empty array.
      element.tag_ids = [];
    }
  }
}

/**
 * create a version of a procedure
 *
 * @param {object} procedure_doc - procedure meta data document
 * @param {object} version_input - procedure meta data provide by the user (null if a working version is created)
 * @param {object} working_version - meta data of the working copy (null if a working version is created)
 * @return {version} - meta data of the version created  
 * 
 */
var createProcedureVersion = async function(procedure_doc, version_input, working_version) {
  let time_now = new Date();
  
  // map of elem_id of elements of the working copy (from elem_id in working copy to elem_id in new version)
  let elem_id_map = {};

  let version_info_new = null;
  
  let procedure_id = procedure_doc['procedure_id'];
  
  // defaults for working copy
  let next_version = 0;
  let version_description = '';
  let version_author = '';
  let flight_dictionary_version = '';
  let sse_dictionary_version = '';
  let time_versioned = '';
  
  let is_working_copy = true;
  
  let elems_copy = null;
  let step_order_edges_copy = null;  

  if (version_input) {
    // This is when creating a for non-working copy  
    is_working_copy = false;
    
    time_versioned = time_now;
    
    // increment version number
    const latest_version = await getProcedureLatestVersion(procedure_id);
    next_version = latest_version + 1;
    
    if (version_input['version_description']) {
      version_description = version_input['version_description'];
    }
    
    if (version_input['version_author']) {
      version_author = version_input['version_author'];
    }
    
    sanitize_internal_attrs(working_version)
    // version_input does not have dictionary versions. Copy from working_version.
    if (working_version['flight_dictionary_version']) {
      flight_dictionary_version = working_version['flight_dictionary_version'];
    }     
    
    if (working_version['sse_dictionary_version']) {
      sse_dictionary_version = working_version['sse_dictionary_version'];
    }    
  } else {
    version_description = 'Working Version';
  } 
  
  let key = uuid.v4();
  let version_info = {
    '_key': key,
    'version_id': key,
    'version_description': version_description,
    'files': [],
    'institutional_release_id': '',
    'version_author': version_author,
    'api_version': config.api_version,
    'flight_dictionary_version': flight_dictionary_version,   
    'sse_dictionary_version': sse_dictionary_version, 
    'procedure_id': procedure_doc['procedure_id'],
    'version': next_version,   
    'time_versioned': time_versioned,
    'time_submitted': '',
    'time_approved': '',
    'time_released': '',
    'time_obsoleted': '',
    'time_saved': time_now,
    'tags': [],
    'status': is_working_copy ? 'WORKING' : 'VERSIONED',
    'conversations_count': 0,
    'unresolved_conversations_count': 0,
  }
  
  if (working_version) {
    // Merge the working copy and the new meta data so that meta data such as files can be inherited from the working copy.
    version_info = extend(true, {}, working_version, version_info)
  }
  
  // update tag_ids
  const tag_id_map = _reassignTagIds(version_info);  
  
  try {
    let res = await procedure_version_collection.save(version_info, {'returnNew': true});
    version_info_new = res['new'];
    let has_version_edge = {'_from': procedure_doc['_id'], '_to': version_info_new['_id'], 'version': next_version};
    await has_version_collection.save(has_version_edge);
  } catch (err) {
    return Promise.reject('Failed to save version info: ' + get_sj_error_message(err)); 
  }

  if (!is_working_copy) {
    // copy the working copy elements
    const working_copy_doc = await getProcedureVersion(procedure_id, 0);
    let res = await base_funcs.getElementsAndEdges('PROCEDURE', working_copy_doc._id);

    let elems = res.elems;
    let step_order_edges = res.step_order_edges;
    
    let vertex_idd_dict = {};
    // new version has been already created.
    vertex_idd_dict[working_copy_doc._id] = version_info_new._id;
    
    // update elems to save them as new vertices
    for (let i=0; i < elems.length; i++) {
      let elem = elems[i];
      let old_key = elem._key;                    
      let old_id = elem._id;
      let new_key = uuid.v4();
      let new_id = 'procedureElement/' + new_key;

      elem_id_map[elem.elem_id] = new_key;

      elem._key = new_key;
      elem._id = new_id;
      elem['elem_id'] = new_key;
      elem['_version'] = next_version;
      elem['version_id'] = version_info_new._key;

      // reset conversations
      elem.conversations = [];
      
      log.trace(`Add vertex id to map. old_id: ${old_id} new_id: ${new_id}`);
      vertex_idd_dict[old_id] = new_id;
    }            
    
    // update step order edges to save them as new edges
    for (let i=0; i < step_order_edges.length; i++) {
      let edge = step_order_edges[i];
      let key_old = edge._key;                    
      let id_old = edge._id;
      let key_new = uuid.v4();
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
    
    elems_copy = elems;
    step_order_edges_copy = step_order_edges;
  }

  if (elems_copy) {
    // update elem_id references in VI Status Steps
    elems_copy.forEach(function (elem_copy) {
      if (elem_copy.elem_type == 'STEP' && elem_copy.step_type == 'VERIFICATION_ITEM_STATUS') {
        if (elem_copy.authoring_user_input && elem_copy.authoring_user_input.steps) {
          log.trace(`version elem_id_map: ${elem_id_map}`);
          elem_copy.authoring_user_input.steps.forEach(function (step) {
            log.trace(`version step.elem_id: ${step.elem_id}`);
            if (elem_id_map.hasOwnProperty(step.elem_id)) {
              step['elem_id'] = elem_id_map[step.elem_id];
            } else {
              // the element was not found
              step['elem_id'] = '';
            }
          });
        } 
      }
    });
    
    // update tag_ids
    _updateTagIds(elems_copy, tag_id_map);

    log.trace('Now copy elems in DB');
    
    try {
      await procedure_element_collection.import(elems_copy, {'type': 'documents'});
      let msg = 'Elements were copied. count: {0} procedure_id: {1} version: {2}'.format(
        elems_copy.length, procedure_id, next_version);
      log.trace(msg);          
    } catch (err) {
      let msg = 'Failed to copy elements. procedure_id: {0} version: {1}'.format(procedure_id, next_version);
      return Promise.reject(msg);
    }
  }    

  if (step_order_edges_copy) {
    log.trace('Now copy step order edges');
    // Note: res is not used
    
    try {
      await procedure_step_order_collection.import(step_order_edges_copy, {'type': 'documents'});
      let msg = 'Step orders were copied. count: {0} procedure_id: {1} version: {2}'.format(
        step_order_edges_copy.length, procedure_id, next_version);
      log.trace(msg);        
    } catch (err) {
      let msg = 'Failed to copy step orders. procedure_id: {0} version: {1}'.format(procedure_id, next_version);
      return Promise.reject(msg);
    }    
  }
    
  const current_version = await getProcedureCurrentVersion(procedure_id);
  const current_released_version = await getProcedureCurrentReleasedVersion(procedure_id);
 
  try {
    // It is possible that current_version stays the same, which is ok here.
    // update current_released_version of procedure meta data
    await procedure_collection.update(procedure_id, {'current_released_version': current_released_version, 
      'current_version': current_version, 'time_saved': time_now});     
  } catch(err) {
    return Promise.reject('Failed to update procedure info: ' + get_sj_error_message(err)); 
  }

  return Promise.resolve(version_info_new);
}

/**
 * load a procedure version into the working copy
 *
 * @param {String} procedure_id - id of the target procedure
 * @param {String} source_procedure_id - id of the source procedure
 * @param {String} source_procedure_version - version of the source procedure 
 * @return {Promise} - Promise that may be fulfilled with no data
 */
async function loadToWorkingCopy(procedure_id, source_procedure_id, source_procedure_version) {
  return _loadWorkingCopy(procedure_id, source_procedure_id, source_procedure_version, null);
}

/**
 * create a procedure label
 *
 * @param {Object} procedureLabelInput - input data for label
 * @return {Promise} - Promise that may be fulfilled with a newly created venue
 */
var createProcedureLabel = async function(procedureLabelInput) {
  var name = procedureLabelInput['name'] || '';
  if (name == '') {
    return Promise.reject('Name was not specified for procedure label');
  }

  var labelEmpty = {
    'name' : '',
    'description' : '',
    'label_id' : '',
  };

  var procedure_label = extend(true, {}, labelEmpty, procedureLabelInput);

  var elem_id = uuid.v4();
  procedure_label['_key'] = elem_id;
  procedure_label['label_id'] = elem_id;
  
  try {
    const res = await procedure_label_collection.save(procedure_label, {returnNew: true});
    return Promise.resolve(sanitize_internal_attrs(res['new']));
  } catch (err) {
    return Promise.reject('Failed to create a procedure label in DB: ' + get_sj_error_message(err)); 
  }
}

/**
 * delete a procedure label
 *
 * @param {String} label_id - Unique id of a procedure label
 * @return {Promise}
 */
var deleteProcedureLabel = async function(label_id) {
  try {
    await procedure_label_collection.removeByKeys([label_id]);
  } catch (err) {
    return Promise.reject('Failed to delete venue from DB: ' + get_sj_error_message(err)); 
  }
}


/**
 * Import a procedure version into the working copy. The working copy will be replaced. 
 *
 * @param {String} procedure_id - id of procedure
 * @param {Object} procedure_version_data - procedure version data
 * @return {Promise}
 */
async function importProcedureVersion(procedure_id, procedure_version_data) {
  return _loadWorkingCopy(procedure_id, null, null, procedure_version_data);
}


/**
 * Get procedure, versions, elements and edges
 *
 * @param {String} procedure_id - id of procedure
 * @param {Integer} version - procedure version to export
 * @param {Boolean} released_only - export only released versions
 * @return {Promise}
 */
async function exportProcedureVersions(procedure_id, version, released_only) {
  const versions = version !== null ? [version] : [];
  const procedure_info = await getProcedure(procedure_id);
  sanitize_internal_attrs(procedure_info);

  const res = await getProcedureVersions(procedure_id, null, null, null, 
    null, null, null, 'ASC', 'VERSION');

  const version_infos = res.data;
  for (const version_info of version_infos) {
    sanitize_internal_attrs(version_info);
  }

  const selected_version_infos = [];
  const res_elements = [];
  const res_edges = [];


  if (versions && (versions.length > 0)) {
    for (const version_info of version_infos) {
      if (versions.includes(version_info.version)) {
        if (!released_only || (released_only && version_info.status === 'RELEASED')) {
          selected_version_infos.push(version_info);
        }
      }
    }
  } else {
    for (const version_info of version_infos) {
      // version created in old releases may not have status field. So, check time_released in that case.
      if (!released_only || (released_only && (version_info.status === 'RELEASED' || version_info.time_released))) {
        selected_version_infos.push(version_info);
      }
    }
  }

  for (const version_info of selected_version_infos) {
    let {vertices, edges} = await base_funcs.getVerticesEdges('PROCEDURE', `${definitions.PROCEDURE_VERSION}/${version_info.version_id}`);
    for (const vertex of vertices) {
      if (vertex._id && vertex._id.startsWith(definitions.PROCEDURE_ELEMENT)) {
        sanitize_internal_attrs(vertex);
        res_elements.push(vertex);
      } else if (vertex._id && vertex._id.startsWith(definitions.PROCEDURE_VERSION)) {
        // ignore root vertex such as procedure version
      } else {
        return Promise.reject(`Unexpected vertex type during procedure export: ${vertex._id}`);
      }
    }
    for (const edge of edges) {
      if (edge._id && edge._id.startsWith(definitions.PROCEDURE_STEP_ORDER)) {
        edge['edge_collection_name'] = definitions.PROCEDURE_STEP_ORDER;
        sanitize_internal_attrs(edge);
        res_edges.push(edge);
      } else {
        return Promise.reject(`Unexpected edge type during procedure export: ${edge._id}`);
      }
    }    
  }

  return Promise.resolve({
    procedure_info: procedure_info,
    version_infos: selected_version_infos,
    elements: res_elements,
    edges: res_edges
  });
}

/**
 * Import procedure, versions, elements and edges
 *
 * @param {Object} import_input - import input
 * @return {Promise} 
 */
 async function importProcedureVersions(import_input) {
  const procedure_id = import_input && import_input.procedure_info ? import_input.procedure_info.procedure_id : null;
  if (!procedure_id) {
    return Promise.reject(`Cannot import procedure. procedure id was not provided.`);
  }

  const version_infos = import_input && import_input.version_infos ? import_input.version_infos : [];

  if (version_infos.length === 0) {
    return Promise.reject(`Cannot import procedure. contains no procedure versions.`);
  }

  const elements =  import_input && import_input.elements ? import_input.elements : [];
  if (elements.length === 0) {
    log.warning(`No procedure element was contained. procedure_id: ${procedure_id}`);
  }

  let res = null;
  let procedure_info = null;

  try {
    procedure_info = await getProcedure(procedure_id);
  } catch (err) {
    if (err === `No procedure was found for procedure_id: ${procedure_id}`) {
      // continue
    } else {
      return Promise.reject(err);
    }
  }

  import_input.procedure_info._key = procedure_id;
  if (procedure_info) {
    // procedure exists
    try {
      await procedure_collection.update(procedure_id, import_input.procedure_info);
    } catch (err) {
      return Promise.reject('Failed to update procedure meta data in DB: ' + get_sj_error_message(err)); 
    }
  } else {
    // create new procedure
    try {
      res = await procedure_collection.save(import_input.procedure_info, {'returnNew': true});
    } catch (err) {
      let msg = 'Failed to save procedure in DB: {0}'.format(get_sj_error_message(err));
      return Promise.reject(msg);
    }
  
    procedure_info = res['new'];
    // create a working version    
    await createProcedureVersion(procedure_info, null, null);
  }

  res = await getProcedureVersions(procedure_id, null, null, null, 
    null, null, null, 'ASC', 'VERSION');
  const existing_version_infos = res.data;
  const existing_versions = existing_version_infos.map((version_info) => version_info.version);

  for (const version_info of version_infos) {
    if (existing_versions.includes(version_info.version)) {
      log.debug(`deleting a version. procedure_id: ${procedure_id} version: ${version_info.version}`);
      await deleteProcedureVersion(procedure_id, version_info.version, true);
    }
  }

  // add hasVersion edges
  const has_version_edges = [];
  // import versions
  for (const version_info of version_infos) {
    version_info._key = version_info.version_id;
    has_version_edges.push({'_from': `procedure/${procedure_id}`, '_to': `procedureVersion/${version_info.version_id}`, 
      'version': version_info.version});
  }

  try {
    log.debug(`importing procedure versions. procedure_id: ${procedure_id}`);
    await procedure_version_collection.import(version_infos, {'type': 'documents'});
  } catch (err) {
    let msg = `Failed to import procedure versions. procedure_id: ${procedure_id}`;
    return Promise.reject(msg);
  }

  try {
    await has_version_collection.import(has_version_edges, {'type': 'documents'});
  } catch (err) {
    let msg = `Failed to add hasVersion edges. procedure_id: ${procedure_id}`;
    return Promise.reject(msg);
  }

  // update current_version and current_released_version
  const current_version = await getProcedureCurrentVersion(procedure_id);
  const current_released_version = await getProcedureCurrentReleasedVersion(procedure_id);
 
  try {
    let time_now = new Date();
    await procedure_collection.update(procedure_id, {'current_released_version': current_released_version, 
      'current_version': current_version, 'time_saved': time_now});     
  } catch (err) {
    return Promise.reject('Failed to update procedure info: ' + get_sj_error_message(err)); 
  }

  // import version elements
  const edges = import_input && import_input.edges ? import_input.edges : [];
  if (edges.length === 0) {
    log.warning(`No procedure element edge was contained. procedure_id: ${procedure_id}`);
  }

  for (const element of elements) {
    element._key = element.elem_id;
  }

  const elem_order_edges = [];
  for (const edge of edges) {
    if (edge.edge_collection_name === definitions.PROCEDURE_STEP_ORDER) {
      delete edge['edge_collection_name'];
      elem_order_edges.push(edge);
    } else {
      log.warning(`Unrecognized edge type: ${edge.edge_collection_name}`);
    }
  }  

  try {
    log.debug(`importing version elements. procedure_id: ${procedure_id} count: ${elements.length}`);
    await procedure_element_collection.import(elements, {'type': 'documents'});
  } catch (err) {
    let msg = `Failed to import elements. procedure_id: ${procedure_id}`;
    return Promise.reject(msg);
  }

  try {
    log.debug(`importing version element edges. procedure_id: ${procedure_id} count: ${elem_order_edges.length}`);
    await procedure_step_order_collection.import(elem_order_edges, {'type': 'documents'});
  } catch (err) {
    let msg = `Failed to import element edges. procedure_id: ${procedure_id}`;
    return Promise.reject(msg);
  }
}

/**
 * Create a tag for procedure
 *
 * @param {String} procedure_id - id of procedure
 * @param {Object} tag_input - tag input
 * @return {Promise} - Promise that may be fulfilled with array of tags
 */
async function procedureCreateTag(procedure_id, tag_input) {
  const tag_name = tag_input.hasOwnProperty('name') && tag_input.name ? 
    tag_input.name.trim() : '';
  if (tag_name === '') {
    return Promise.reject('Tag name was not provided.'); 
  }
  
  const tag_description = tag_input.hasOwnProperty('description') && tag_input.description ? 
    tag_input.description.trim() : '';
  
  const working_copy = await getProcedureVersion(procedure_id, 0);
  const tags = working_copy.hasOwnProperty('tags') ? working_copy.tags : [];
  const {index: index, tag: existing_tag} = _getTagByName(tags, tag_name);
  
  if (existing_tag) {
    return Promise.reject(`Tag with the same name exists. name: ${tag_name}`); 
  }
  
  const tag = {
    tag_id: uuid.v4(),
    name: tag_name,
    description: tag_description
  };
  tags.push(tag);
  
  const working_copy_updated = await updateProcedureVersion(procedure_id, 0, {tags: tags});
  return Promise.resolve(working_copy_updated.tags);
}

/**
 * Update a tag
 *
 * @param {String} procedure_id - id of procedure
 * @param {String} tag_id - id of tag 
 * @param {Object} tag_input - tag input
 * @return {Promise} - Promise that may be fulfilled with array of tags
 */
async function procedureUpdateTag(procedure_id, tag_id, tag_input) {
  
  const working_copy = await getProcedureVersion(procedure_id, 0);
  const tags = working_copy.hasOwnProperty('tags') ? working_copy.tags : [];
  const {index: index, tag: existing_tag} = _getTagById(tags, tag_id);
  
  if (!existing_tag) {
    return Promise.reject(`Tag was not found. tag_id: ${tag_id}`); 
  }

  if (tag_input.hasOwnProperty('name')) {
    const tag_name = tag_input.name ? tag_input.name.trim() : '';
    if (tag_name === '') {
      return Promise.reject('Tag name cannot be empty.'); 
    }
    existing_tag.name = tag_name;
  }
  
  if (tag_input.hasOwnProperty('description')) {
    const tag_description = tag_input.description ? tag_input.description.trim() : '';
    existing_tag.description = tag_description;
  }
  
  const working_copy_updated = await updateProcedureVersion(procedure_id, 0, {tags: tags});
 
  return Promise.resolve(working_copy_updated.tags);
}

/**
 * Delete a tag from procedure
 *
 * @param {String} procedure_id - id of procedure
 * @param {String} tag_id - id of tag 
 * @return {Promise} - Promise that may be fulfilled with array of tags
 */
async function procedureDeleteTag(procedure_id, tag_id) {
  
  const working_copy = await getProcedureVersion(procedure_id, 0);
  const tags = working_copy.hasOwnProperty('tags') ? working_copy.tags : [];
  const {index: index, tag: existing_tag} = _getTagById(tags, tag_id);
  
  if (!existing_tag) {
    return Promise.reject(`Tag was not found. tag_id: ${tag_id}`); 
  }

  // delete tag
  tags.splice(index, 1);
  
  const working_copy_updated = await updateProcedureVersion(procedure_id, 0, {tags: tags});

  // update tags of elements
  const version_id = await getProcedureVersionId(procedure_id, 0);  
  const elems = await getElements(`procedureVersion/${version_id}`, null, null, null, true, false);
  
  const update_inputs = [];
  
  for (const elem of elems) {
    const tag_ids = elem.hasOwnProperty('tag_ids') ? elem.tag_ids : [];
    let index = tag_ids.indexOf(tag_id)
    if (index > -1) {
      tag_ids.splice(index, 1);
      update_inputs.push({
        elem_id: elem.elem_id,
        tag_ids: tag_ids
      });
    }
  }
  
  const updated_elems = await updateElements(update_inputs);
  const updated_elems_tags = [];
  for (const updated_elem of updated_elems) {
    updated_elems_tags.push({elem_id: updated_elem.elem_id, tag_ids: updated_elem.tag_ids});
  }
 
  return Promise.resolve({tags: working_copy_updated.tags, elems: updated_elems_tags});  
}

/**
 * Apply a tag to an element
 *
 * @param {String} procedure_id - id of procedure
 * @param {String} elem_id - id of element
 * @param {String} tag_id - id of tag 
 * @return {Promise} - Promise that may be fulfilled with array of updated tags of elements
 */
async function procedureElementApplyTag(procedure_id, elem_id, tag_id) {
  const working_copy = await getProcedureVersion(procedure_id, 0);
  const tags = working_copy.hasOwnProperty('tags') ? working_copy.tags : [];
  const {index: index, tag: existing_tag} = _getTagById(tags, tag_id);
  
  if (!existing_tag) {
    return Promise.reject(`Tag was not found. tag_id: ${tag_id}`); 
  }
  
  const elems = await getElements(`procedureElement/${elem_id}`, null, null, null, true, false);
  
  const update_inputs = [];
  
  for (const elem of elems) {
    const tag_ids = elem.hasOwnProperty('tag_ids') ? elem.tag_ids : [];
    
    if (!tag_ids.includes(tag_id)) {
      tag_ids.push(tag_id);
      update_inputs.push({
        elem_id: elem.elem_id,
        tag_ids: tag_ids
      });
    }
  }
  
  const updated_elems = await updateElements(update_inputs);
  const updated_elems_tags = [];
  for (const updated_elem of updated_elems) {
    updated_elems_tags.push({elem_id: updated_elem.elem_id, tag_ids: updated_elem.tag_ids});
  }
 
  return Promise.resolve(updated_elems_tags);
}

/**
 * Remove a tag from an element
 *
 * @param {String} procedure_id - id of procedure
 * @param {String} elem_id - id of element
 * @param {String} tag_id - id of tag 
 * @return {Promise} - Promise that may be fulfilled with array of updated tags of elements
 */
async function procedureElementRemoveTag(procedure_id, elem_id, tag_id) {

  const elems = await getElements(`procedureElement/${elem_id}`, null, null, null, true, false);
  const parent_elems = await getParentElements(elem_id);

  const check_elems = parent_elems.concat(elems);
    
  const update_inputs = [];
  
  for (const elem of check_elems) {
    const tag_ids = elem.hasOwnProperty('tag_ids') ? elem.tag_ids : [];
    const index = tag_ids.indexOf(tag_id);
    if (index > -1) {
      tag_ids.splice(index, 1);
      update_inputs.push({
        elem_id: elem.elem_id,
        tag_ids: tag_ids
      });
    }
  }
  
  const updated_elems = await updateElements(update_inputs);
  const updated_elems_tags = [];
  for (const updated_elem of updated_elems) {
    updated_elems_tags.push({elem_id: updated_elem.elem_id, tag_ids: updated_elem.tag_ids});
  }
 
  return Promise.resolve(updated_elems_tags);
}

/**
 * Import a procedure version into the working copy. 
 * The working copy will be replaced. 
 * This function is for dual use. Either procedure id and version are provided, 
 * or procedure_version_data is provied.
 *
 * @param {String} procedure_id - id of the target procedure
 * @param {String} source_procedure_id - id of the source procedure
 * @param {String} source_procedure_version - version of the source procedure 
 * @param {Object} procedure_version_data - procedure version data
 * @return {Promise}
 */
async function _loadWorkingCopy(procedure_id, source_procedure_id, source_procedure_version, 
    procedure_version_data) {
  log.trace(`_loadWorkingCopy procedure_id: ${procedure_id}`);  

  if (procedure_version_data) {
    source_procedure_id = procedure_version_data['procedure_id'];
    source_procedure_version = procedure_version_data['version'];
  }

  let cursor = null;
  let edges = null;
  
  let source_tags = [];
  let elems = [];
  let step_order_edges = [];
  
  // map from old vertex id to new vertex id
  let vertex_idd_dict = {};
    
  let elems_copy = null;
  let step_order_edges_copy = null;  
  
  const elem_id_map = {};
    
  const working_copy_doc = await getProcedureVersion(procedure_id, 0);

  // Step 1: Get the current working copy and delete all elements of it
  try {
    cursor = await procedure_step_order_collection.byExample({'_from': working_copy_doc._id});
    edges = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get step order: ' + get_sj_error_message(err)); 
  }    

  if (edges.length == 0) {
    let msg = `No element was found for procedure_id: ${procedure_id}`;
    log.trace(msg);                        
  } else {
    for (let i=0; i < edges.length; i++) {
      let root_elem_idd = edges[i]._to;
      let msg = `Delete element of target working copy. procedure_id: ${procedure_id} root_elem_idd: ${root_elem_idd}`;
      log.trace(msg);
      
      let root_elem_id = root_elem_idd.split('/')[1];
      await deleteElement(procedure_id, root_elem_id);
    }
  }    

  // Step 2: Copy elements from the selected procedure version    
  if (procedure_version_data) {
    source_tags = procedure_version_data.tags || [];
    
    // version becomes the working copy
    let procedure_version_idd = 'procedureVersion/' + procedure_version_data.version_id;
    procedure_version_data._id = procedure_version_idd;
    vertex_idd_dict[procedure_version_idd] = working_copy_doc._id;

    parseProcedureElementsAndEdges(procedure_version_data, elems, step_order_edges);
  } else {
    const version_doc = await getProcedureVersion(source_procedure_id, source_procedure_version);
    
    source_tags = version_doc.tags || [];

    let res = await base_funcs.getElementsAndEdges('PROCEDURE', version_doc._id);

    elems = res.elems;
    step_order_edges = res.step_order_edges;

    // version becomes the working copy
    vertex_idd_dict[version_doc._id] = working_copy_doc._id;      
  }
  
  const version_info_to_update = {'tags': source_tags};
  const tag_id_map = _reassignTagIds(version_info_to_update);
          
  // update elems to save them as new vertices
  for (let i=0; i < elems.length; i++) {
    let elem = elems[i];
    let old_key = elem._key;                    
    let old_id = elem._id;
    let new_key = uuid.v4();
    let new_id = 'procedureElement/' + new_key;
    
    elem_id_map[elem.elem_id] = new_key;
    elem._key = new_key;
    elem._id = new_id;
    elem['elem_id'] = new_key;
    elem['procedure_id'] = procedure_id;                    
    elem['_version'] = 0;
    elem['version_id'] = working_copy_doc._key;
    
    // delete _id. They will be regenerated by db. 
    delete elem['_id'];                        

    // reset conversations
    elem.conversations = [];    
    
    // log.trace(`Add vertex id to map. old_id: ${old_id} new_id: ${new_id}`);
    vertex_idd_dict[old_id] = new_id;
  }            
                  
  // update step order edges to save them as new edges
  for (let i=0; i < step_order_edges.length; i++) {
    let edge = step_order_edges[i];
    let key_old = edge._key;                    
    let id_old = edge._id;
    let key_new = uuid.v4();
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

  elems_copy = elems;
  step_order_edges_copy = step_order_edges;

  // update working version in DB
  await updateProcedureVersion(procedure_id, 0, version_info_to_update);
  
  // update elem_id references in VI Status Steps
  for (const elem_copy of elems_copy) {
    if (elem_copy.elem_type === 'STEP' && elem_copy.step_type === 'VERIFICATION_ITEM_STATUS') {
      if (elem_copy.authoring_user_input && elem_copy.authoring_user_input.steps) {
        for (const step of elem_copy.authoring_user_input.steps) {
          if (elem_id_map.hasOwnProperty(step.elem_id)) {
            step['elem_id'] = elem_id_map[step.elem_id];
          } else {
            // the element was not found
            step['elem_id'] = '';
          }          
        }
      } 
    }
  }
  
  // update tag_ids in elements
  _updateTagIds(elems_copy, tag_id_map);
  // update elements in DB
  if (elems_copy) {
    log.trace('Now copy elems');
    
    try {
      await procedure_element_collection.import(elems_copy, {'type': 'documents'});
      let msg = 'Elements were copied. count: {0} procedure_id: {1} source_procedure_id: {2} source_procedure_version: {3}'.format(
        elems_copy.length, procedure_id, source_procedure_id, source_procedure_version);
      log.trace(msg);      
    } catch (err) {
      let msg = 'Failed to copy elements. count: {0} procedure_id: {1} source_procedure_id: {2} source_procedure_version: {3}'.format(
        elems_copy.length, procedure_id, source_procedure_id, source_procedure_version);
      return Promise.reject(msg);
    }    
  }

  //      
  if (step_order_edges_copy) {
    log.trace('Now copy step order edges');

    try {
      await procedure_step_order_collection.import(step_order_edges_copy, {'type': 'documents'});
      let msg = 'Step orders were copied. count: {0} procedure_id: {1} source_procedure_id: {2} source_procedure_version: {3}'.format(
        step_order_edges_copy.length, procedure_id, source_procedure_id, source_procedure_version);
      log.trace(msg);      
    } catch (err) {
      let msg = 'Failed to copy step orders. procedure_id: {1} source_procedure_id: {2} source_procedure_version: {3}'.format(
        step_order_edges_copy.length, procedure_id, source_procedure_id, source_procedure_version);
      return Promise.reject(msg);
    }   
  }

  log.trace('Procedure version was imported into working copy.');
  return Promise.resolve();
}

var parseProcedureElementsAndEdges = function (parent, elems, step_order_edges) {

  if (parent.hasOwnProperty('elem_id')) {
    elems.push(parent);
  }

  if (parent.hasOwnProperty('children')) {
    for (let i=0; i < parent.children.length; i++) {
      let elem = parent.children[i];
      let elem_id = elem['elem_id'];
      let elem_idd = 'procedureElement/' + elem_id;
      elem['_id'] = elem_idd;

      let step_order_edge = {'_from': parent._id, '_to': elem._id, 'idx': i};
      step_order_edges.push(step_order_edge);

      parseProcedureElementsAndEdges(elem, elems, step_order_edges);
    }

    delete parent['children'];
  }
}

/**
 * get procedure meta data
 *
 * @param {String} procedure_id - id of procedure
 * @return {Promise} - Promise that may be fulfilled with the procedure meta data
 */
var getProcedure = async function (procedure_id) {
  let docs = null;
  try {
    docs = await procedure_collection.lookupByKeys([procedure_id]);
  } catch (err) {
    let msg = 'Failed to find procedure. procedure_id: {0} Reason: {1}'.format(procedure_id, get_sj_error_message(err));
    log.error(msg);      
    return Promise.reject(msg);
  }

  if (docs.length > 1) {
    return Promise.reject('More than one procedure was found for procedure_id: {0}'.format(procedure_id));
  }
  else if (docs.length == 0) {
    return Promise.reject('No procedure was found for procedure_id: {0}'.format(procedure_id));
  } else {
    return Promise.resolve(docs[0]);
  }    
}

/**
 * Update metadata of an procedure
 *
 * @param {String} procedure_id - id of procedure
 * @param {Object} procedure_meta_data - meta data of procedure
 * @return {Promise}
 */
var updateProcedure = async function (procedure_id, procedure_meta_data) {
  log.trace('updateProcedure procedure_id: {0} procedure_meta_data: {1}'.format(
      procedure_id, JSON.stringify(procedure_meta_data)))
  procedure_meta_data['time_saved'] = new Date(); 
  try {
    return await procedure_collection.update(procedure_id, procedure_meta_data);
  } catch (err) {
    return Promise.reject('Error when updating a procedure: ' + get_sj_error_message(err));
  }
}

var deleteProcedure = async function (procedure_id) {
  var target_id = 'procedure/' + procedure_id;
  let docs = null;
  try {
    docs = await procedure_collection.lookupByKeys([procedure_id]);
  } catch (err) {
    return Promise.reject('Failed to find procedure: ' + get_sj_error_message(err));
  }

  if (docs.length == 0) {
    return Promise.reject('Procedure was not found. procedure_id: {0}'.format(procedure_id));
  } else if (docs.length > 1) {
    return Promise.reject('More than one procedure was not found. procedure_id: {0}'.format(procedure_id));
  } else {
    base_funcs.sanitize_internal_attrs(docs[0]);
  }

  let cursor = null;
  let entries = null;

  try {
    cursor = await db.query(
      `
      FOR vertex, edge
        IN 1..1000
        OUTBOUND '${target_id}'
        GRAPH 'procedure_graph'
        OPTIONS {bfs: true}
        RETURN {v_id: vertex._id, v_key: vertex._key, e_id: edge._id, e_key: edge._key}
      `,
      {},
      {count: true}
    );
    entries = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get procedure graph from DB: ' + get_sj_error_message(err)); 
  }

  // vertex keys
  let version_keys = [];
  let elem_keys = [];

  // edge keys
  let has_version_keys = [];
  let step_order_keys = [];
  let working_copy_keys = [];

  for (let entry of entries) {
    if (entry.v_id.startsWith('procedureElement/')) {
      elem_keys.push(entry.v_key);
    } else if (entry.v_id.startsWith('procedureVersion/')) {
      version_keys.push(entry.v_key);
    } else {
      log.warning(`Unrecognized element: ${entry.v_id}`);
    }

    if (entry.e_id.startsWith('procedureStepOrder/')) {
      step_order_keys.push(entry.e_key);
    } else if (entry.e_id.startsWith('hasVersion/')) {
      has_version_keys.push(entry.e_key);
    } else {
      log.warning(`Unrecognized edge type: ${entry.e_id}`);
    }
  }

  try {
    await procedure_collection.removeByKeys([procedure_id]);
    await procedure_element_collection.removeByKeys(elem_keys);
    await procedure_version_collection.removeByKeys(version_keys);
    await procedure_step_order_collection.removeByKeys(step_order_keys);
    await has_version_collection.removeByKeys(has_version_keys);
  } catch (err) {
    return Promise.reject('Failed to delete procedure data from DB: ' + get_sj_error_message(err)); 
  }

  return Promise.resolve(null);
}

/**
 * get the latest version of procedure.
 *
 * @param {String} procedure_id - id of procedure
 * @return {Promise} - Promise that may be fulfilled with the version number. 0 indicates there is no version.
 */
var getProcedureLatestVersion = async function (procedure_id) {
  let q_str = `
  FOR doc IN procedureVersion
  FILTER doc.procedure_id == "${procedure_id}"
  SORT doc.version DESC  
  LIMIT 0, 1
  RETURN { version: doc.version, version_id: doc.version_id }
  `
  q_str = removeEmptyLines(q_str);
  
  // log.trace('q_str: %s', q_str);
  let cursor = null;
  let docs = null;
  try {
    cursor = await db.query(q_str);
    docs = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get procedure version from DB: ' + get_sj_error_message(err)); 
  }

  if (docs.length == 0) {
    // There must be always a working copy.
    let msg = 'No version was found for procedure_id: {0}'.format(procedure_id);
    log.error(msg);
    return Promise.reject(msg);        
  } else {
    return Promise.resolve(docs[0].version);
  }
}  

/**
 * get the current version of procedure. The latest version that is not obsolete.
 *
 * @param {String} procedure_id - id of procedure
 * @return {Promise} - Promise that may be fulfilled with the version number. 0 indicates there is no current version.
 */
var getProcedureCurrentVersion = async function (procedure_id) {
  let q_str = `
  FOR doc IN procedureVersion
  FILTER doc.procedure_id == "${procedure_id}"
  FILTER doc.status != "OBSOLETE"
  SORT doc.version DESC  
  LIMIT 0, 1
  RETURN { version: doc.version, version_id: doc.version_id }
  `
  q_str = removeEmptyLines(q_str);
  
  // log.trace('q_str: %s', q_str);
  let cursor = null;
  let docs = null;
  try {
    cursor = await db.query(q_str);
    docs = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get procedure version from DB: ' + get_sj_error_message(err)); 
  }

  if (docs.length == 0) {
    // There must be always a working copy.
    let msg = 'getProcedureCurrentVersion. No version was found for procedure_id: {0}'.format(procedure_id);
    log.error(msg);
    return Promise.reject(msg);        
  } else {
    return Promise.resolve(docs[0].version);
  }
}  

/**
 * get the current released version of procedure. The latest version that has been release.
 *
 * @param {String} procedure_id - id of procedure
 * @return {Promise} - Promise that may be fulfilled with the version number. 0 indicates there is no current released version.
 */
var getProcedureCurrentReleasedVersion = async function (procedure_id) {
  let q_str = `
  FOR doc IN procedureVersion
  FILTER doc.procedure_id == "${procedure_id}"
  FILTER doc.status == "RELEASED" 
  SORT doc.version DESC  
  LIMIT 0, 1
  RETURN { version: doc.version, version_id: doc.version_id }
  `
  q_str = removeEmptyLines(q_str);
  
  // log.trace('q_str: %s', q_str);

  let cursor = null;
  let docs = null;
  try {
    cursor = await db.query(q_str);
    docs = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get current released version from DB: ' + get_sj_error_message(err)); 
  }  

  if (docs.length == 0) {
    // If there is no released version, return 0
    return Promise.resolve(0);        
  } else {
    return Promise.resolve(docs[0].version);
  }

}  

/**
 * get procedure meta data
 *
 * @param {String} procedure_id - id of procedure
 * @param {Integer} version - version number 
 * @return {Promise} - Promise that may be fulfilled with the version meta data
 */
var getProcedureVersion = async function (procedure_id, version) {
  let cursor = null;
  let docs = null;
  try {
    cursor = await procedure_version_collection.byExample({'procedure_id': procedure_id, 'version': version});
    docs = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get procedure version from DB: ' + get_sj_error_message(err)); 
  }  
  
  if (docs.length == 0) {
    let msg = `Version was not found for procedure_id: ${procedure_id} version: ${version}`;
    log.error(msg);
    return Promise.reject(msg);
  } else if (docs.length > 1) {
    let msg = `More than one version was found for procedure_id: ${procedure_id} version: ${version}`;
    log.error(msg);
    return Promise.reject(msg);            
  } else {
    return Promise.resolve(docs[0]);
  }
}  


/**
 * Update metadata of a procedure version
 *
 * @param {String} procedure_id - id of procedure
 * @param {Integer} version - version number 
 * @param {Object} version_meta_data - meta data of version
 * @return {Promise}
 */
var updateProcedureVersion = async function (procedure_id, version, version_meta_data) {
  log.trace('updateProcedureVersion procedure_id: {0} version: {1} version_meta_data: {2}'.format(
      procedure_id, version, JSON.stringify(version_meta_data)))

  let version_doc = null;
  try {
    version_doc = await getProcedureVersion(procedure_id, version);
  } catch (err) {
    return Promise.reject('Failed to get procedure version from DB: ' + get_sj_error_message(err)); 
  }  

  let version_id = version_doc['version_id'];
    
  let time_now = new Date();
  version_meta_data['time_saved'] = time_now;
  
  try {
    await procedure_version_collection.update(version_id, version_meta_data);
  } catch (err) {
    return Promise.reject('Failed to update procedure version meta data in DB: ' + get_sj_error_message(err)); 
  }

  const procedure_input = {
    'time_saved': time_now
  };
  
  try {
    await procedure_collection.update(procedure_id, procedure_input);
  } catch (err) {
    return Promise.reject('Failed to update procedure meta data in DB: ' + get_sj_error_message(err)); 
  }
  
  const version_info = await getProcedureVersion(procedure_id, version);
  return base_funcs.sanitize_internal_attrs(version_info);
}

var deriveVersionStatus = function (version_info) {
  if (version_info['time_obsoleted']) {
    return 'OBSOLETE';
  } else if (version_info['time_released']) {
    return 'RELEASED';
  } else if (version_info['time_approved']) {
    return 'APPROVED';
  } else if (version_info['time_submitted']) {
    return 'SUBMITTED';
  } else {
    return 'VERSIONED';
  }  
}

/**
 * Update metadata of a procedure version
 *
 * @param {String} procedure_id - id of procedure
 * @param {Integer} version - version number 
 * @param {Object} version_status_input - version status input
 * @return {Promise}
 */
var updateProcedureVersionStatus = async function (procedure_id, version, version_status_input) {
  let version_doc = null;
  try {
    version_doc = await getProcedureVersion(procedure_id, version);
  } catch (err) {
    return Promise.reject('Failed to get procedure version from DB: ' + get_sj_error_message(err)); 
  }
  let version_id = version_doc['version_id'];  
  
  const action = version_status_input['action'];
    
  const version_meta_data = {};
  const time_now = new Date();
  
  if (action === 'SUBMIT') {
    version_meta_data['time_submitted'] = time_now;
  } else if (action === 'APPROVE') {
    version_meta_data['time_approved'] = time_now;
  } else if (action === 'RELEASE') {
    version_meta_data['time_released'] = time_now;
  } else if (action === 'OBSOLETE') {
    version_meta_data['time_obsoleted'] = time_now;
  } else if (action === 'UNOBSOLETE') {
    version_meta_data['time_obsoleted'] = '';
  } else if (action === 'UNRELEASE') {
    version_meta_data['time_released'] = '';
  } else if (action === 'UNAPPROVE') {
    version_meta_data['time_approved'] = '';
  } else if (action === 'UNSUBMIT') {
    version_meta_data['time_submitted'] = '';
  }
  
  version_meta_data['status'] = deriveVersionStatus(extend(true, {}, version_doc, version_meta_data));
  
  await procedure_version_collection.update(version_id, version_meta_data);
  const current_version = await getProcedureCurrentVersion(procedure_id);
  const current_released_version = await getProcedureCurrentReleasedVersion(procedure_id);
  
  const procedure_input = {
    'current_released_version': current_released_version, 
    'current_version': current_version
  };
    
  // It is possible that current_version stays the same, which is ok here.
  // update current_released_version of procedure meta data
  try {
    await procedure_collection.update(procedure_id, procedure_input);
  } catch (err) {
    return Promise.reject('Failed to update procedure meta data in DB: ' + get_sj_error_message(err)); 
  }
  
  const version_info = await getProcedureVersion(procedure_id, version);
  return base_funcs.sanitize_internal_attrs(version_info);
}

var deleteProcedureVersion = async function (procedure_id, version, force=false) {
  let version_doc = null;
  let version_id = null;
  let version_idd = null;
  
  if (version == 0 && !force) {
    let msg = 'Cannot delete a working version. procedure_id: {0} version: {1}'.format(
        procedure_id, version);
    return Promise.reject(msg);    
  }
  
  let cursor = null;
  let docs = null;
  try {
    cursor = await procedure_version_collection.byExample({'procedure_id': procedure_id, 'version': version});
    docs = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get procedure version from DB: ' + get_sj_error_message(err)); 
  }  

  if (docs.length == 0) {
    return Promise.reject('Procedure version was not found. procedure_id: {0} version: {1}'.format(
        procedure_id, version));
  } else if (docs.length > 1) {
    return Promise.reject('More than one version was found. procedure_id: {0} version: {1}'.format(
        procedure_id, version));
  } else {
    version_doc = docs[0];
    version_id = version_doc['version_id'];
    version_idd = version_doc['_id'];
    log.trace(`version_id: ${version_id} version_idd: ${version_idd}`);
  }

  let target_id = version_idd;    
  let entries = null;

  try {
    cursor = await db.query(
      `
      FOR vertex, edge, path
        IN 1..10000
        OUTBOUND '${target_id}'
        GRAPH 'procedure_graph'
        OPTIONS {bfs: true}
        RETURN {v_id: vertex._id, v_key: vertex._key, e_id: edge._id, e_key: edge._key}
      `,
      {},
      {count: true}
    );
    entries = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get procedure graph from DB: ' + get_sj_error_message(err));
  } 

  // vertex keys
  let elem_keys = [];

  // edge keys
  let step_order_keys = [];

  for (let entry of entries) {
    if (entry.v_id.startsWith('procedureElement/')) {
      elem_keys.push(entry.v_key);
    } else {
      log.warning(`Unrecognized element: ${entry.v_id}`);
    }

    if (entry.e_id.startsWith('procedureStepOrder/')) {
      step_order_keys.push(entry.e_key);
    } else {
      log.warning(`Unrecognized edge type: ${entry.e_id}`);
    }
  }

  // delete vertices
  await procedure_version_collection.removeByKeys([version_id]);
  await procedure_element_collection.removeByKeys(elem_keys);

  // delete edges
  await procedure_step_order_collection.removeByKeys(step_order_keys);        
  await has_version_collection.removeByExample({'_to': version_idd});

  // force is true when procedure is imported. If so, do not update time_saved
  if (!force) {
    try {
      await procedure_collection.update(procedure_id, {'time_saved': new Date()});
    } catch (err) {
      return Promise.reject('Failed to get update procedure meta data in DB: ' + get_sj_error_message(err));
    }
  }
  
  return Promise.resolve(null);
}

var getProcedureVersions = async function(procedure_id, offset, limit, version_description, 
    institutional_release_id, version_author, status, sort, sort_by) {  
  let offset_limit = '';
  if (offset !== null && limit !== null) {
    offset_limit = `LIMIT ${offset}, ${limit}`  
  } else if (limit !== null) {
    offset_limit = `LIMIT ${limit}` 
  } else if (offset !== null) {
    log.warning('Not allowed to specify only offset in query');
  }

  let procedure_id_filter = `FILTER doc.procedure_id == "${procedure_id}"`;  

  let version_description_filter = '';
  if (version_description !== null) {
    version_description_filter = `FILTER LIKE(doc.version_description, "%${version_description}%", true)`;  
  }

  let institutional_release_id_filter = '';
  if (institutional_release_id !== null) {
    institutional_release_id_filter = `FILTER LIKE(doc.institutional_release_id, "%${institutional_release_id}%", true)`;  
  }  
  
  let version_author_filter = '';
  if (version_author !== null) {
    version_author_filter = `FILTER LIKE(doc.version_author, "%${version_author}%", true)`;  
  }  
  
  let status_filter = '';
  if (status !== null) {
    status_filter = `FILTER doc.status == "${status}"`;  
  }
  
  let sort_option = `SORT doc.${sort_by === null ? 'time_versioned' : sort_by.toLowerCase()} ${sort === null ? 'DESC' : sort}`
  
  // Note: make sure offset_limit is the last filter so that it is applied after other filters have been applied.
  let q_str =
  `
  FOR doc in procedureVersion   
    ${procedure_id_filter}  
    ${version_description_filter}
    ${institutional_release_id_filter}
    ${version_author_filter}
    ${status_filter}
    ${sort_option}
    ${offset_limit}    
    RETURN doc
  `
  q_str = removeEmptyLines(q_str);
  
  log.trace(`getProcedureVersions q_str: ${q_str}`);

  let cursor = null;
  let data = null;
  try {
    cursor = await db.query(q_str, {}, {'count': true, 'fullCount': true});
    data = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get procedure versions from DB: ' + get_sj_error_message(err)); 
  }    
  const fullCount = cursor.extra.stats.hasOwnProperty('fullCount') ? cursor.extra.stats.fullCount : cursor.count;
  return Promise.resolve({'data': data, 'total_count': fullCount});
}

/**
 * get elements of a procedure
 *
 * @param {String} procedure_id - Unique id of procedure
 * @param {String} elem_type - Type of element (SECTION, STEP, PARAGRAPH). Use null to get all.
 * @param {String} step_type - Type of step. Use null to get all
 * @param {Number} offset - Start index for pagination
 * @param {String} limit - Max entries to return
 * @param {String} sort - Sort option (DESC, ASC)
 * @param {String} description - Filtering based on description
 * @return {Promise} - A promise that may be fulfilled with an array of elements
 */
var getElementsFromProcedure = async function (procedure_id, elem_type, step_type, offset, limit, sort, description) {

  let query_str = 'FOR doc IN procedureElement FILTER doc.procedure_id == "' + procedure_id + '" ';
  
  // TODO: we need to set version for elements
  query_str += '&& doc._version == 0 '
  
  // TODO: Use string template instead
  // TODO: Order the list according to the step order in procedure

  if(elem_type != null) {
    query_str += '&& doc.elem_type == "' + elem_type + '" '
  }

  if(step_type != null) {
    query_str += '&& doc.step_type == "' + step_type + '" '
  }

  query_str += 'RETURN doc'

  log.trace(`query_str: ${query_str}`);

  let cursor = null;
  let data = null;
  try {
    cursor = await db.query(query_str, {}, {"count": true});
    data = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get procedure elements from DB: ' + get_sj_error_message(err)); 
  }   
  
  let count = cursor.count;
  let from_index = Math.min(offset, count);
  let to_index = Math.min(offset+limit, count);
  return Promise.resolve({'data': data.slice(from_index, to_index), 'total_count': cursor.count});
}

/**
 * Update time_saved of working copy and procedure
 *
 * @param {String} procedure_id - Unique id of procedure
 * @return {Promise}
 */
var updateTimeSaved = async function(procedure_id) {
  // time will be set inside updateProcedureVersion()
  log.trace('updateTimeSaved');
  await updateProcedureVersion(procedure_id, 0, {});

  // time will be set inside updateProcedure()
  return await updateProcedure(procedure_id, {});
}

/**
 * Add an element to a procedure (working copy)
 *
 * @param {String} procedure_id - Unique id of procedure
 * @param {Object} input_elem - Element to add
 * @param {String} insert_after_id - id of an element after which new element will be added.
 *                 Use "-1" to insert as the first element.
 * @param {String} level - Relationship of the new element with respect to "insert_after_id".
 *                 Either CHILD or SIBLING.
 * @return {Promise} promise that will be fulfilled with the new element and the
 * list of elements whose numbers were changed.
 */
var addElement = async function(procedure_id, input_elem, insert_after_id, level) {

  const version_id = await getProcedureVersionId(procedure_id, 0);   // get working copy with version = 0

  // add internal attribute to make it easy to query elements based on procedure_id and version number
  let input_elem_mod = extend(true, {}, input_elem, {'procedure_id': procedure_id, '_version': 0});
  const res = await base_funcs.addElement('PROCEDURE', version_id, input_elem_mod, insert_after_id, level);

  await updateTimeSaved(procedure_id);
  
  return Promise.resolve(res);
}

/**
 * Move an element
 *
 * @param {String} procedure_id - Unique id of procedure
 * @param {Array} elem_ids - ids of element to move
 * @param {String} insert_after_id - id of an element after which the element will be moved.
 *                 Use "-1" to insert as the first element.
 * @param {String} level - Relationship of the element with respect to "insert_after_id".
 *                 Either CHILD or SIBLING.
 * @return {Promise} promise that will be fulfilled with the
 * list of elements whose numbers were changed.
 */
var moveElement = async function(procedure_id, elem_ids, insert_after_id, level) {
  const version_id = await getProcedureVersionId(procedure_id, 0);
  const res = await base_funcs.moveElement('PROCEDURE', version_id, elem_ids, insert_after_id, level);
  await updateTimeSaved(procedure_id);
  return Promise.resolve(res);
}

/**
 * Copy an element
 *
 * @param {String} procedure_id - Unique id of procedure
 * @param {Array} elem_ids - ids of element to copy
 * @param {String} insert_after_id - id of an element after which the element will be moved.
 *                 Use "-1" to insert as the first element.
 * @param {String} level - Relationship of the element with respect to "insert_after_id".
 *                 Either CHILD or SIBLING.
 * @param {String} source_execution_id - id of the the execution of the source (optional). 
 *                  Use null if not provided. 
 * @param {String} source_procedure_id - id of the the procedure of the source (optional). 
 *                  Use null if not provided. This takes precedence over source_execution_id. 
 *                  source_procedure_version must be provided as well.
 * @param {Integer} source_procedure_version - version of the the procedure of the source (optional). 
 *                  Use null if not provided. source_procedure_id must be provided as well.
 * @return {Promise} promise that will be fulfilled with the copied elements and the
 * list of elements whose numbers were changed.
 */
var copyElement = async function(procedure_id, elem_ids, insert_after_id, level,
  source_execution_id, source_procedure_id, source_procedure_version) {
  // default values
  let target_root_type = 'PROCEDURE';  
  let target_root_id = await getProcedureVersionId(procedure_id, 0);
  let source_root_type = 'PROCEDURE';
  let source_root_id = target_root_id;

  if (source_procedure_id && (source_procedure_version !== null)) {
    source_root_type = 'PROCEDURE';
    source_root_id = await getProcedureVersionId(source_procedure_id, source_procedure_version);  
  } else if (source_procedure_id && (source_procedure_version === null)) {
    throw new Error('source_procedure_version was not provided for source_procedure_id');
  } else if ((source_procedure_id === null) && (source_procedure_version !== null)) {
    throw new Error('source_procedure_id was not provided for source_procedure_version');
  }    
  else if (source_execution_id) {
    source_root_type = 'EXECUTION';
    source_root_id = source_execution_id;
  }

  const res = await base_funcs.copyElement(source_root_type, target_root_type, source_root_id, elem_ids, target_root_id, insert_after_id, level);

  await updateTimeSaved(procedure_id);
  return Promise.resolve(res);
}

/**
 * Get structure of the working copy of procedure. This will return hierarchical json structure of sections
 * and steps. The root can be a procedure or an element of a procedure
 * 
 * @param {String} root_idd - id of procedure or element including collection name.
 *                            For example, 'procedure/id-123' or 'procedureElement/id-432'
 * @param {Boolean} simple - true to return only essential fields such as elem_id and elem_type
*/
var getStructure = async function(root_idd, simple) {
  log.trace(`getStructure root_idd: ${root_idd}`);
  
  return await base_funcs.getStructure('PROCEDURE', root_idd, simple);
}

/**
 * Get a list of parents of an element
 * 
 * @param {String} elem_id element id 
*/
var getParentElements = async function(elem_id) {
  
  return await base_funcs.getParentElements('PROCEDURE', `procedureElement/${elem_id}`);
}

/**
 * Get elements of procedure version.
 * 
 * @param {String} root_idd - id of version or element including collection name.
 *                            For example, 'procedureVersion/id-123' or 'element/id-432'
 * @param {String} elem_type - elem type filter
 * @param {String} step_type - step type filter
 * @param {String} description - description filter
 * @param {Boolean} all_elements - include all elements regardless of comments
 * @param {Boolean} comment_filter - include elements with general comments
*/
var getElements = async function(root_idd, elem_type, step_type, description,
  all_elements=false, comment_filter=false) {
  log.trace(`getElements root_idd: ${root_idd}`);
  
  return await base_funcs.getElements('PROCEDURE', root_idd, elem_type, step_type, description,
    all_elements, comment_filter, false, false);
}

/**
 * Get elements of execution or procedure.
 * 
 * @param {String} elems_input - elems to be updated
 * @return Array of elements updated
*/
var updateElements = async function(elems_input) {

  return await base_funcs.updateElements('PROCEDURE', elems_input);
}

/**
 * remove unselected elements in a procedure section 
 * 
 * @param {Object} parent - parent element (procedure version or element) 
 * @param {Object} selectedElemsMap map from elem id to elem 
 */
var removeUnselectedElements = function(parent, selectedElemsMap) {
  if (parent.children) {
    let selected_children = parent.children.filter(e => selectedElemsMap[e._id] !== undefined);
    parent.children = selected_children; 
    
    for (let i=0; i < parent.children.length; i++) {
      let child = parent.children[i];
      removeUnselectedElements(child, selectedElemsMap);  
    }    
  }
}

/**
 * Get structure of the selected procedure elements. Used for preview.
 * 
 * @param {String} elem_id - id of procedure or element including collection name.
 *                            For example, 'procedure/id-123' or 'procedureElement/id-432'
 *                            
 * @return {Future} structure of the procedure section
 * 
*/
var getProcedureSectionStructure = async function(root_type, elem_id) {
  log.trace(`getProcedureSectionStructure elem_id: ${elem_id}`);
  
  let var_dict = base_funcs.get_root_specific_variables(root_type);  

  let elems_copy = [];
  let step_order_edges_copy = [];  
  
  const elem_doc = await base_funcs.getElement(root_type, elem_id);

  const procedure_section = elem_doc;
  
  let elem_type = elem_doc['elem_type']; 
  if (elem_type != 'PROCEDURE_SECTION') {
    let msg = 'Element is not a procedure section. elem_id: {0} elem_type: {1}'.format(elem_id, elem_type);
    return Promise.reject(msg);
  }

  const execution_user_input = elem_doc[var_dict['user_input']];
  const reference_procedure_id = execution_user_input['reference_procedure_id'];
  const reference_procedure_version = execution_user_input['reference_procedure_version'];
  const reference_elements = execution_user_input['elements'];

  const version_doc = await getProcedureVersion(reference_procedure_id, reference_procedure_version);
  const root_elem = await getStructure(version_doc._id, false);

  //log.trace(`structure: ${JSON.stringify(root_elem)}`);
  //log.trace(`reference_elements: ${JSON.stringify(reference_elements)}`);
  let selectedElemsMap = getSelectedElementsMap(reference_elements);
  //log.trace(`selectedElemsMap: ${JSON.stringify(selectedElemsMap)}`);    
  removeUnselectedElements(root_elem, selectedElemsMap);
  //log.trace(`selected structure: ${JSON.stringify(root_elem)}`);
  return Promise.resolve(root_elem);
}


/**
 * get the map of selected elements in a procedure section 
 * 
 * @param {Object} reference_elements - reference elements 
 * @return {Object} idd to element map 
 */
var getSelectedElementsMap = function(reference_elements) {
  let elemMap = {};
  
  if (reference_elements) {
    for (let i=0; i < reference_elements.length; i++) {
      let elem = reference_elements[i];
  
      if (elem['elem_type'] && elem['selected']) {
        let _id = 'procedureElement/{0}'.format(elem.elem_id);
        elemMap[_id] = elem; 
      }    
    }
  }

  return elemMap;
}


/**
 * Get outline of the procedure version.
 * 
 * @param {String} root_idd - id of procedure version including collection name.
 *                            For example, 'procedureVersion/id-123'
*/
var getOutline = async function(root_idd, tag_ids) {
  // log.info(`getOutline root_idd: ${root_idd}`);
  
  const root = await base_funcs.getStructure('PROCEDURE', root_idd, false);

  let elems = [];
  base_funcs.collectOutlineElements(root, elems);
  elems.forEach(elem => {  
    // Select an element when all its tags (if any) are selected
    const diff_tag_ids = elem.tag_ids.filter(tag_id => !tag_ids.includes(tag_id));
    elem.selected = diff_tag_ids.length === 0;  
  });
  
  const elem_map = {};
  for (const elem of elems) {
    elem_map[elem.elem_id] = elem; 
  }
  
  // Select parent element if a child is selected based on tag.
  // Note that we can loop from the last element because elements are sorted according to the element structure.
  for (const elem of elems.slice().reverse()) {
    // log.info(`getOutline number: ${elem.number} selected: ${elem.selected} parent_id: ${elem.parent_id}`);
    if (elem.selected && elem.parent_id) {
      const parent = elem_map[elem.parent_id];
      // log.info(`   getOutline parent.selected: ${parent.selected}`);
      if (parent && (!parent.selected)) {
        // below should not happen because 
        // 1) When an element is tagged, its children are tagged.
        // 2) When an element is untagged, its parents are untagged
        // 3) If a parent has no tag, it is selected by default.
        log.warning(`   getOutline: parent is selected because a child is selected. parent number: ${parent.number} elem number: ${elem.number}`);
        parent.selected = true;
      }
    }
  }
  
  return Promise.resolve(elems);
}

/**
 * Get the content of the element
 * @param {String} elem_id - unique id of element (section, step, or paragraph)
 * @return {Promise}
*/
var getElement = async function(elem_id) {
  return base_funcs.getElement('PROCEDURE', elem_id);
}

/**
 * Delete an element from procedure
 * @param {String} procedure_id - id of the procedure
 * @param {String} elem_id - id of the element to delete
 * @return {Promise} promise that will be fulfilled with the
 * list of elements whose numbers were changed.
 */
var deleteElement = async function(procedure_id, elem_id) {
  const res = await base_funcs.deleteElement('PROCEDURE', elem_id, false);

  await updateTimeSaved(procedure_id);

  return Promise.resolve(res);
}

/**
 * Update content of an element.
 * This will merge the current content with the content of elem_in.
 * @param {String} procedure_id - id of the procedure
 * @param {String} elem_id - id of the target element
 * @param {Object} elem_in - content of the element
*/
var updateElement = async function(procedure_id, elem_id, elem_in) {
  
  const res = await base_funcs.updateElement('PROCEDURE', elem_id, elem_in);
  
  await updateTimeSaved(procedure_id);
  
  return Promise.resolve(res);   
}


var getProcedureFiles = async function(procedure_id, offset, limit) {
  const elem = await getProcedureVersion(procedure_id,0);

  let files = [];
  log.trace(`elem: ${JSON.stringify(elem)}`);
  if (elem.hasOwnProperty('files')) {
    files = elem['files'];
  }

  log.trace(`files: ${JSON.stringify(files)}`);
  let response = {'total' : files.length}
  if(offset) {
    files = files.slice(offset);
  }

  if(limit) {
    files = files.slice(0,limit);
  }

  response['files'] = files;
  return Promise.resolve(response);  
}

var getProcedureFile = async function(procedure_id, file_id) {
  const version = await getProcedureVersion(procedure_id,0);

  let idx = -1;
  let files = null;
  if (version.hasOwnProperty('files')) {
    files = version['files'];
    for (let i = 0; i < files.length; i++) {
      log.trace(`file file_id: ${files[i]['file_id']} file_id: ${file_id}`);
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

var deleteProcedureFile = async function(procedure_id, file_id) {
  log.trace(`deleteFile procedure_id: ${procedure_id} file_id: ${file_id}`);

  const procedure = await getProcedureVersion(procedure_id,0);

  let idx = -1;
  let files = null;
  if (procedure.hasOwnProperty('files')) {
    files = procedure['files'];
    for (let i = 0; i < files.length; i++) {
      if(files[i]['file_id'] == file_id) {
        idx = i;
        break;
      }
    }
  }

  if (idx == -1) {
    let msg = `File was not found. file_id: ${file_id}`;
    log.error(msg);
    return Promise.reject(msg);
  }

  let fileToDelete = files[idx]
  files.splice(idx, 1);

  await updateProcedureVersion(procedure_id, 0, {'files': files});

  return Promise.resolve(fileToDelete);
}
  

var addProcedureFile = async function(procedure_id, input_file) {
  let key = uuid.v4();
  let file_info_def = {
    'file_id': key,
    'file_name': '',
    'procedure_id': '',
    'url': ''
  }

  let file_info = extend(true, {}, file_info_def, input_file);

  const elem = await getProcedureVersion(procedure_id,0);

  let files = elem.hasOwnProperty('files') ? elem['files'] : [];
  files.push(file_info);
  let meta_data = {'files': files};

  await updateProcedureVersion(procedure_id, 0, meta_data);

  return Promise.resolve(file_info);

}

var addFile = async function(elem_id, input_file) {
  return base_funcs.addFile('PROCEDURE', elem_id, input_file);
}

var deleteFile = async function(elem_id, file_id) {
  return base_funcs.deleteFile('PROCEDURE', elem_id, file_id);
}

var getFiles = async function(elem_id, offset, limit) {
  return base_funcs.getFiles('PROCEDURE', elem_id, offset, limit);
}

var getFile = async function(elem_id, file_id) {
  return base_funcs.getFile('PROCEDURE', elem_id, file_id);
}


/**
 * check if the element belongs to a versioned procedure. If so, return a rejected promise
 * with the provided msg.
 * @param {String} procedure_id - id of procedure element
 * @param {String} elem_id - id of procedure element
 * @param {String} msg - error message if the execution has been closed
 * @return {Promise} - Promise that may be rejected if the element is versioned
 */
var checkElementVersioned = async function (procedure_id, elem_id, msg) {
  const elem = await getElement(elem_id);
  const working_version_id = await getProcedureVersionId(procedure_id, 0);

  if (elem.version_id != working_version_id) {
    return Promise.reject(msg);
  } else {
    return Promise.resolve();
  }
}

/**
 * check if the element belongs to a working copy of procedure. If so, return a rejected promise
 * with the provided msg.
 * @param {String} procedure_id - id of procedure element
 * @param {String} elem_id - id of procedure element
 * @param {String} msg - error message if the execution has been closed
 * @return {Promise} - Promise that may be rejected if the element is versioned
 */
var checkElementNotVersioned = async function (procedure_id, elem_id, msg) {
  const elem = await getElement(elem_id);
  const working_version_id = await getProcedureVersionId(procedure_id, 0);

  if (elem.version_id == working_version_id) {
    return Promise.reject(msg);
  } else {
    return Promise.resolve();
  }
}

/**
 * Check if a new procedure section would create a circular reference of procedure
 * @argument reference_procedure_id: referred procedure id
 * @argument reference_procedure_version: referred procedure version
 * @argument reference_elements: elements of the referred procedure sections
 * @argument elem_id: id of the current procedure section
 */
var checkCircularReferenceElem = async function(reference_procedure_id, reference_procedure_version, reference_elements, elem_id) {
  // keep the list of procedure sections that have been traversed not to traverse again.
  let checked_elem_ids = new Set();
  for (const reference_element of reference_elements) {
    if (reference_element.elem_type === 'PROCEDURE_SECTION' && reference_element.selected) {
      if (reference_element.elem_id === elem_id) {
        let msg = `Circular reference is not allowed. ` + 
          `reference_procedure_id: ${reference_procedure_id} reference_procedure_version: ${reference_procedure_version} number: ${reference_element.number} elem_id: ${reference_element.elem_id}`;
        return Promise.reject(msg);
      } else {
        if (!checked_elem_ids.has(reference_element.elem_id)) {
          await _checkCircularReferenceElem(reference_procedure_id, reference_procedure_version, 
            reference_element, elem_id, checked_elem_ids);
        }
      }
    }
  }
}

/**
 * Check recursively if a new procedure section would create a circular reference of procedure/version.
 * 
 * @argument reference_procedure_id: referred procedure id
 * @argument reference_procedure_version: referred procedure version
 * @argument reference_element: referred procedure section
 * @argument elem_id: id of the current procedure section
 * @argument checked_elem_ids: set of elem ids that have been checked
 */
var _checkCircularReferenceElem = async function(reference_procedure_id, reference_procedure_version, 
  reference_element, elem_id, checked_elem_ids) {
  let proc_section = await base_funcs.getElement('PROCEDURE', reference_element.elem_id);
  if (!proc_section) {
    let msg = `Element was not found. ` + 
      `reference_procedure_id: ${reference_procedure_id} reference_procedure_version: ${reference_procedure_version} number: ${reference_element.number} elem_id: ${reference_element.elem_id}`;
    return Promise.reject(msg);
  }

  checked_elem_ids.add(reference_element.elem_id);

  const input = proc_section.authoring_user_input;
  if (input.reference_procedure_id && (input.reference_procedure_version == 0 || input.reference_procedure_version > 0)) {
    for (const element of input.elements) {
      if (element.selected && element.elem_type === 'PROCEDURE_SECTION') {
        if (element.elem_id === elem_id) {
          let msg = `Circular reference is not allowed. ` + 
            `reference_procedure_id: ${input.reference_procedure_id} reference_procedure_version: ${input.reference_procedure_version} number: ${element.number} elem_id: ${element.elem_id}`;
          return Promise.reject(msg);
        } else {
          if (!checked_elem_ids.has(element.elem_id)) {
            await _checkCircularReferenceElem(input.reference_procedure_id, input.reference_procedure_version, element, elem_id, checked_elem_ids);
          }
        }
      }
    }
  }
}

/**
 * Replace an element of proedure
 *
 * @param {String} procedure_id - procedure id
 * @param {String} elem_id - target element id
 * @param {Object} replace_element_input - data of the source element 
 * @return {Object} updated element 
 * 
 */
 var replaceProcedureElement = async function(procedure_id, elem_id, replace_element_input) {
  const execution_id = replace_element_input.execution_id;
  if (!execution_id) {
    return Promise.reject(`execution_id was not provided.`);
  }
  const source_elem_id = replace_element_input.elem_id;
  if (!source_elem_id) {
    return Promise.reject(`source elem_id was not provided.`);
  }
  const source_elem = await base_funcs.getElement('EXECUTION', source_elem_id);
  const target_elem = await base_funcs.getElement('PROCEDURE', elem_id);

  const source_elem_type = source_elem.elem_type;
  const target_elem_type = target_elem.elem_type;

  if (source_elem_type !== target_elem_type) {
    const msg = `Cannot replace element. elem_type does not match. source: ${source_elem_type} target: ${target_elem_type}`;
    return Promise.reject(msg);
  }

  if (target_elem_type === 'STEP') {
    const source_step_type = source_elem.step_type;
    const target_step_type = target_elem.step_type;
    if (source_step_type !== target_step_type) {
      const msg = `Cannot replace step. step_type does not match. source: ${source_step_type} target: ${target_step_type}`;
      return Promise.reject(msg);
    }
  }

  const elem_in = getElementForReplacement(source_elem);

  return await updateElement(procedure_id, elem_id, elem_in);
}

/**
* Prepare an execution element for replacement of a procedure element. 
*
* @param {Object} source_elem - source element in an execution
* @return {Object} object that can be used to replace a target procedure element
*/
function getElementForReplacement(source_elem) {
  const elem_in = {
    title: source_elem.title,
    description: source_elem.description,
  };

  if (source_elem.specification) {
    // specification is needed by remove_execution_time_input_fields
    elem_in.specification = deepcopy(source_elem.specification);
  }

  if (source_elem.hasOwnProperty('execution_user_input')) {
    elem_in['authoring_user_input'] = deepcopy(source_elem['execution_user_input']);
    base_funcs.remove_execution_time_input_fields(elem_in);
  }

  // remove specification that is not needed any more
  delete elem_in['specification'];

  return elem_in;
}


/**
 * get an array of procedure versions that refers to the given procedure version
 *
 * @param {object} procedure_id - procedure id referenced
 * @param {object} version - procedure version referenced. null if not used. 
 * @return {procedure_and_versions} - array of {'procedure_id': '', 'version_id': ''}  
 * 
 */
var getReferencingProcedureVersions = async function(procedure_id, version) {
  let procedure_and_versions = [];

  let q_str = `
  FOR elem IN procedureElement
  FILTER elem.elem_type == "PROCEDURE_SECTION"
  FILTER elem.authoring_user_input.reference_procedure_id == "${procedure_id}"
  FILTER elem.authoring_user_input.reference_procedure_version == ${version}
  RETURN elem
  `;  

  let cursor = null;
  let procedure_sections = null;

  try {
    cursor = await db.query(q_str);
    procedure_sections = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get procedure sections from DB: ' + get_sj_error_message(err)); 
  }

  procedure_sections.forEach((procedure_section) => {
    procedure_and_versions.push({
      'procedure_id': procedure_section.procedure_id, 
      'version_id': procedure_section.version_id
    });
  });
  return Promise.resolve(procedure_and_versions);
}

/**
 * get the version of procedure given version_id
 *
 * @param {object} version_id - procedure version id
 * @return {version} - -1 if not found  
 * 
 */
var findProcedureVersion = async function(version_id) {
  let version = -1;

  let cursor = null;
  let procedure_versions = [];  
  try {
    cursor = await procedure_version_collection.byExample(
      {
        'version_id': version_id
      }
    );
    procedure_versions = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get procedure sections from DB: ' + get_sj_error_message(err));
  }
  
  if (procedure_versions.length > 1) {
    return Promise.reject('More than one procedure version was found for version_id: {0}'.format(version_id));
  }
  else if (procedure_versions.length == 0) {
    log.warning('No procedure version was found for version_id: {0}'.format(version_id));
  } else {
    version = procedure_versions[0].version;
  }

  return Promise.resolve(version);
}

/**
 * add a conversation
 *
 * @param {String} procedure_id - Unique id of procedure
 * @param {Integer} version - procedure version
 * @param {String} elem_id - Unique id of element
 * @param {String} input_conversation - conversation input
 * @param {String} user_name - user name
 * @return {Promise} - Promise that may be fulfilled with the comment
 */
var addConversation = async function(procedure_id, version, elem_id, input_conversation, user_name) {
  const res = await base_funcs.addConversation('PROCEDURE', procedure_id, elem_id, input_conversation, user_name);
  await updateConversationsCount(procedure_id, version);
  return res;
}

/**
 * get conversations
 *
 * @param {String} procedure_id - Unique id of procedure
 * @param {String} elem_id - Unique id of element
 * @return {Promise} - Promise that may be fulfilled with the comment
 */
var getConversations = async function(procedure_id, elem_id) {
  return await base_funcs.getConversations('PROCEDURE', procedure_id, elem_id);
}

/**
 * get a conversation of an element
 *
 * @param {String} procedure_id - Unique id of procedure
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @return {Promise} - A promise that may be fulfilled with a conversation
 */
var getConversation = async function(procedure_id, elem_id, conversation_id) {
  return await base_funcs.getConversation('PROCEDURE', procedure_id, elem_id, conversation_id);
}

/**
 * update a conversation
 *
 * @param {String} procedure_id - Unique id of procedure
 * @param {Integer} version - procedure version
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @param {String} conversation_input - conversation input
 * @param {String} user_name - user name
 * @return {Promise} - Promise that may be fulfilled with the comment
 */
var updateConversation = async function(procedure_id, version, elem_id, conversation_id, conversation_input, user_name) {
  const res = await base_funcs.updateConversation('PROCEDURE', procedure_id, elem_id, conversation_id, conversation_input, user_name);
  await updateConversationsCount(procedure_id, version);
  return res;
}

/**
 * delete a conversation
 *
 * @param {String} procedure_id - Unique id of procedure
 * @param {Integer} version - procedure version
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @return {Promise}
 */
var deleteConversation = async function(procedure_id, version, elem_id, conversation_id) {
  const res = await base_funcs.deleteConversation('PROCEDURE', procedure_id, elem_id, conversation_id);
  await updateConversationsCount(procedure_id, version);
  return res;
}

/**
 * update conversations count for procedure version
 *
 * @param {String} procedure_id - Unique id of procedure
 * @param {Integer} version - procedure version
 * @return {Promise} - Promise updated version info
 */
var updateConversationsCount = async function(procedure_id, version) {
  const version_id = await getProcedureVersionId(procedure_id, version);  
  const elems = await base_funcs.getConversationStatuses('PROCEDURE', `procedureVersion/${version_id}`);
  
  let conversations_count = 0;
  let unresolved_conversations_count = 0;
  
  for (const elem of elems) {
    if (elem.conversations) {
      for (const conversation of elem.conversations) {
        if (conversation.type === 'COMMENT') {
          conversations_count++;
          if (conversation.status === 'UNRESOLVED') {
            unresolved_conversations_count++;
          }
        }
      }
    }
  }

  return await updateProcedureVersion(procedure_id, version, {
    conversations_count: conversations_count,
    unresolved_conversations_count: unresolved_conversations_count
  });
}

/**
 * add a comment
 *
 * @param {String} procedure_id - Unique id of procedure
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @param {String} input_comment - New comment
 * @param {String} user_name - user name
 * @return {Promise} - Promise that may be fulfilled with the comment
 */
var addComment = async function(procedure_id, elem_id, conversation_id, input_comment, user_name) {
  return base_funcs.addComment('PROCEDURE', procedure_id, elem_id, conversation_id, input_comment, user_name);
}

/**
 * get comments of an element
 *
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @return {Promise} - A promise that may be fulfilled with an array of comments
 */
var getComments = async function(procedure_id, elem_id, conversation_id, offset, limit) {
  return base_funcs.getComments('PROCEDURE', procedure_id, elem_id, conversation_id, offset, limit);
}

/**
 * get a comment of an element
 *
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @param {String} comment_id - Unique id of comment
 * @return {Promise} - A promise that may be fulfilled with a comment
 */
var getComment = async function(procedure_id, elem_id, conversation_id, comment_id) {
  return base_funcs.getComment('PROCEDURE', procedure_id, elem_id, conversation_id, comment_id);
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
var updateComment = async function(procedure_id, elem_id, conversation_id, comment_id, comment_input, user_name) {
  return base_funcs.updateComment('PROCEDURE', procedure_id, elem_id, conversation_id, comment_id, comment_input, user_name);
}

/**
 * delete a comment
 *
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @param {String} comment_id - Unique id of comment
 * @return {Promise}
 */
var deleteComment = async function(procedure_id, elem_id, conversation_id, comment_id) {
  return base_funcs.deleteComment('PROCEDURE', procedure_id, elem_id, conversation_id, comment_id);
}

/**
 * delete file meta data
 *
 * @param {String} procedure_id - Unique id of procedure
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @param {String} comment_id - Unique id of comment
 * @param {String} file_id - Unique id of file
 * @return {Promise} - Promise that may be fulfilled with no value
 */

var deleteCommentFile = async function(procedure_id, elem_id, conversation_id, comment_id, file_id) {
  return base_funcs.deleteCommentFile('PROCEDURE', procedure_id, elem_id, conversation_id, comment_id, file_id);
}

var addFileComment = async function(procedure_id, elem_id, conversation_id, comment_id, input_file) {
  return base_funcs.addFileComment('PROCEDURE', procedure_id, elem_id, conversation_id, comment_id, input_file);
}

var getCommentFiles = async function(procedure_id, elem_id, conversation_id, comment_id, offset, limit) {
  return base_funcs.getCommentFiles('PROCEDURE', procedure_id, elem_id, conversation_id, comment_id, offset, limit);
}

var getCommentFile = async function(procedure_id, elem_id, conversation_id, comment_id, file_id) {
  return base_funcs.getCommentFile('PROCEDURE', procedure_id, elem_id, conversation_id, comment_id, file_id);
}

var _getTagByName = function(tags, name) {
  if (tags) {
    for (const [index, tag] of tags.entries()) {
      if (tag.name === name) {
        return {index, tag};
      }
    }
  }
  return {index: -1, tag: null};
}

var _getTagById = function(tags, tag_id) {
  if (tags) {
    for (const [index, tag] of tags.entries()) {
      if (tag.tag_id === tag_id) {
        return {index, tag};
      }
    }
  }
  return {index: -1, tag: null};
}

module.exports.addFile = addFile
module.exports.deleteFile = deleteFile
module.exports.getFiles = getFiles
module.exports.getFile = getFile

module.exports.addProcedureFile = addProcedureFile
module.exports.deleteProcedureFile = deleteProcedureFile
module.exports.getProcedureFile = getProcedureFile
module.exports.getProcedureFiles = getProcedureFiles

module.exports.addElement = addElement
module.exports.moveElement = moveElement
module.exports.copyElement = copyElement
module.exports.getElements = getElements
module.exports.updateElements = updateElements
module.exports.getStructure = getStructure
module.exports.getParentElements = getParentElements
module.exports.getProcedureSectionStructure = getProcedureSectionStructure
module.exports.getSelectedElementsMap = getSelectedElementsMap
module.exports.getOutline = getOutline
module.exports.getElement = getElement
module.exports.deleteElement = deleteElement
module.exports.updateElement = updateElement

module.exports.addConversation = addConversation
module.exports.getConversations = getConversations
module.exports.getConversation = getConversation
module.exports.updateConversation = updateConversation
module.exports.deleteConversation = deleteConversation

module.exports.addComment = addComment
module.exports.getComments = getComments
module.exports.getComment = getComment
module.exports.updateComment = updateComment
module.exports.deleteComment = deleteComment

module.exports.addFileComment = addFileComment
module.exports.getCommentFiles = getCommentFiles
module.exports.getCommentFile = getCommentFile
module.exports.deleteCommentFile = deleteCommentFile
module.exports.createProcedureLabel = createProcedureLabel
module.exports.deleteProcedureLabel = deleteProcedureLabel
module.exports.log = log
module.exports.createProcedure = createProcedure
module.exports.getProcedures = getProcedures
module.exports.getProcedure = getProcedure
module.exports.updateProcedure = updateProcedure
module.exports.deleteProcedure = deleteProcedure
module.exports.getElementsFromProcedure = getElementsFromProcedure
module.exports.getProcedureVersionId = getProcedureVersionId
module.exports.loadToWorkingCopy = loadToWorkingCopy
module.exports.procedureCreateTag = procedureCreateTag
module.exports.procedureUpdateTag = procedureUpdateTag
module.exports.procedureDeleteTag = procedureDeleteTag
module.exports.procedureElementApplyTag = procedureElementApplyTag
module.exports.procedureElementRemoveTag = procedureElementRemoveTag
module.exports.importProcedureVersion = importProcedureVersion
module.exports.exportProcedureVersions = exportProcedureVersions
module.exports.importProcedureVersions = importProcedureVersions
module.exports.createProcedureVersion = createProcedureVersion
module.exports.getProcedureVersion = getProcedureVersion
module.exports.getProcedureVersions = getProcedureVersions
module.exports.deleteProcedureVersion = deleteProcedureVersion
module.exports.updateProcedureVersion = updateProcedureVersion
module.exports.updateProcedureVersionStatus = updateProcedureVersionStatus
module.exports.checkElementVersioned = checkElementVersioned
module.exports.checkElementNotVersioned = checkElementNotVersioned
module.exports.checkCircularReferenceElem = checkCircularReferenceElem
module.exports.replaceProcedureElement = replaceProcedureElement