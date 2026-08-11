'use strict';

var jwt = require('jsonwebtoken');
const winston = require('winston');
const MESSAGE = Symbol.for('message');

var arangojs = require('arangojs');
var util = require('util');
var uuid = require('uuid');
var extend = require('extend');
var deepcopy = require('deepcopy');
var definitions = require('../definitions.js');
var config = require('../config.js');
var database_name = config.database_name;

var execution_meta_data_template = {
  'test_conductor': '',
  'time_started': '',
  'time_completed': '',
  'time_updated': '',
  'status': 'NONE',
  'status_message': '',
  'override_justification': '',
  'overridden_by': '',
  'time_overridden': '',
  'error': {}
};

/**
 * format function for string.
 * Example:  'element id is {0}'.format(elem_id)
 */
String.prototype.format = function () {
  var args = arguments;
  return this.replace(/\{(\d+)\}/g, function (m, n) { return args[n]; });
};

var db = arangojs(config.db_url);

var venue_group_collection = db.collection(definitions.VENUE_GROUP);
var venue_collection = db.collection(definitions.VENUE);
var procedure_label_collection = db.collection(definitions.PROCEDURE_LABEL);
var element_collection = db.collection(definitions.ELEMENT);
var step_order_collection = db.collection(definitions.STEP_ORDER);
var revision_collection = db.collection(definitions.REVISION);
var execution_collection = db.collection(definitions.EXECUTION);
var execution_id_gen_collection = db.collection(definitions.EXECUTION_ID_GEN);   // Used to generate autoincrementing execution_id
var run_record_collection = db.collection(definitions.RUN_RECORD);

//Procedure collections
var procedure_element_collection = db.collection(definitions.PROCEDURE_ELEMENT);
var procedure_step_order_collection = db.collection(definitions.PROCEDURE_STEP_ORDER);
var procedure_version_collection = db.collection(definitions.PROCEDURE_VERSION);
var has_version_collection = db.collection(definitions.HAS_VERSION);
var procedure_collection = db.collection(definitions.PROCEDURE);
var procedure_id_gen_collection = db.collection(definitions.PROCEDURE_ID_GEN); 

db.useDatabase(database_name);
db.useBasicAuth(config.db_user, config.db_password);

const custom_log_levels = {
  levels: {
    critical: 0, error: 1, warning: 2, info: 3, debug: 4, trace: 5
  }
};

const json_formatter = (log_entry) => {
  const json_data = {timestamp: new Date()};
  json_data['level'] = log_entry['level'].toUpperCase();
  json_data['message'] = log_entry['message'];

  // meta is the object passed as the 2nd argument to the logging function.
  // If multiple objects are passed, meta will be an array.
  let log_entry_meta = log_entry['meta'];

  if (log_entry_meta) {
    // If the passed object is string, array, or object with no properties, 
    // add it as details.
    if (typeof log_entry_meta === 'string' || log_entry_meta instanceof String) {
      json_data['details'] = [log_entry_meta];
    } else if (Array.isArray(log_entry_meta)) {
      json_data['details'] = log_entry_meta.map(function(item) {
        let item_inspected = util.inspect(item);
        return item_inspected
      });
    } else if (Object.keys(log_entry_meta).length == 0) {
      json_data['details'] = util.inspect(log_entry_meta);
    } else {
      // merge the passed object into json_data
      Object.assign(json_data, log_entry_meta);
    }
  }
  // log_entry[MESSAGE] is not in JSON format. Overwrite in JSON format.
  log_entry[MESSAGE] = JSON.stringify(json_data);  
  
  return log_entry;
}


let transports = [new winston.transports.Console()];

if (process.env.LOG_FILE_PATH != undefined) {
  transports.push(new winston.transports.File({
    filename: process.env.LOG_FILE_PATH, 
    handleExceptions: true,
    maxsize: 5242880,
    maxFiles: 2,
    colorize: false
  }))
}

const log = winston.createLogger({
  levels: custom_log_levels.levels,
  level: process.env.LOG_LEVEL != undefined ? process.env.LOG_LEVEL.toLowerCase() : 'debug',
  format: winston.format.combine(winston.format.splat(), winston.format.simple(), winston.format(json_formatter)()),
  transports: transports,
});


function push_error(message, err) {
  if (typeof err == 'string') {
    err = {'message': err};
  }

  let err_json = '';
  try {
    err_json = JSON.stringify(err);
  } catch (ex) {
    // ignore
  }

  if (err_json) {
    // ING-4322
    // Use JSON.parse() instead of extend(), which may introduce
    // circular dependency.
    const err_new = JSON.parse(err_json);
    err_new.message = message;
    if (!err_new.hasOwnProperty('details') || !Array.isArray(err_new.details)) {
      err_new.details = [];
    }

    if (err.message) {
      if (typeof err.message === 'string') {
        err_new.details.push(err.message);
      } else {
        err_new.details.push(util.inspect(err.message));
      }
    }

    if (err_new.details.length === 0) {
      err_new.details.push(util.inspect(err));
    }

    return err_new;
  } else {
    return {message: message, details: [util.inspect(err)]}
  }
}

/**
 * remove internal attributes of a document from DB
 * @param {String} obj - object that returned from a query to DB
 */
function sanitize_internal_attrs(obj) {
  delete obj['_id'];
  delete obj['_key'];
  delete obj['_rev'];

  return obj;
}

/**
 * remove internal attributes recursively of an element
 * @param {String} obj - procedure/execution element
 */
function sanitize_internal_attrs_recursive(obj) {
  delete obj['_id'];
  delete obj['_key'];
  delete obj['_rev']; 

  if (obj.hasOwnProperty('children')) {
    for (let i = 0; i < obj.children.length; i++) {
      sanitize_internal_attrs_recursive(obj.children[i]);
    }
  }

  if (obj.hasOwnProperty('run_records')) {
    for (let i = 0; i < obj.run_records.length; i++) {
      sanitize_internal_attrs_recursive(obj.run_records[i]);
    }
  }  

  return obj;
}

function get_element_conversation(elem, conversation_id) {
  if (elem.hasOwnProperty('conversations')) {
    let conversations = elem['conversations'];
    for (let i = 0; i < conversations.length; i++) {
      if(conversations[i]['conversation_id'] == conversation_id) {
        return {conversations: conversations, conversation_index: i, conversation: conversations[i]};
      }
    }    
  } else {
    throw new Error(`Element does not have conversations field`);
  }
  
  throw new Error(`conversation was not found. elem_id: ${elem_id} conversation_id: ${conversation_id}`);
}


function get_element_comment(elem, conversation_id, comment_id) {
  const {conversations, conversation_index, conversation} = get_element_conversation(elem, conversation_id);
  if (conversation.hasOwnProperty('comments')) {
    let comments = conversation['comments'];
    for (let i = 0; i < comments.length; i++) {
      if(comments[i]['comment_id'] == comment_id) {
        return {conversations: conversations, conversation_index: conversation_index, conversation: conversation, 
          comments: comments, comment_index: i, comment: comments[i]};
      }
    }    
  } else {
    throw new Error(`Conversation does not have comments field`);
  }   

  throw new Error(`comment was not found. elem_id: ${elem['elem_id']} conversation_id: ${conversation_id} comment_id: ${comment_id}`);
}

function ensure_element_conversations(elem) {
  let conversations = null;
  if (elem.hasOwnProperty('conversations')) {
    conversations = elem['conversations'];
  } else {
    conversations = [];
    elem['conversations'] = conversations;
  }
  
  return conversations;
}

function ensure_element_comments(elem, conversation_id) {
  const {conversations, conversation_index, conversation} = 
    get_element_conversation(elem, conversation_id);
  
  let comments = null;
  if (conversation.hasOwnProperty('comments')) {
    comments = conversation['comments'];
  } else {
    comments = [];
    conversation['comments'] = comments;
  }  
  
  return comments;
}

/**
  Remove temporary index (idx) recursively that was used to sort element at a given level.
  
* @param {Object} elem - element object
*/
function sanitizeElement(elem) {
  // do not need idx anymore

  let parent_id = null;

  delete elem['idx'];

  if (elem.hasOwnProperty('parent_idd')) {
    let parent_idd = elem['parent_idd'];

    if (parent_idd.startsWith('execution/') || parent_idd.startsWith('procedureVersion/')) {
      elem['parent_id'] = '';
    } else {
      elem['parent_id'] = parent_idd.split('/')[1];
    }
    delete elem['parent_idd'];  
  }

  delete elem['_version'];

  if (elem.hasOwnProperty('children')) {
    for (let i = 0; i < elem.children.length; i++) {
      sanitizeElement(elem.children[i]);
    }
  }

  if (elem.hasOwnProperty('run_records')) {
    for (let i = 0; i < elem.run_records.length; i++) {
      delete elem.run_records[i]['run_records'];
      sanitizeElement(elem.run_records[i]);
    }
  }

  return elem;
}

/**
* Prepare element for copy
*
* - re-generated elem_id and _key. 
* - Remove _id.
* - Remove comments
* - Remove execution results
* - Sanitize recursively
* 
* @param {String} source_root_type PROCEDURE or EXECUTION
* @param {String} target_root_type PROCEDURE or EXECUTION
* @param {Object} elem - copied element that may contain children
* @param {Array} target_tag_ids - tag ids defined in target procedure
* @param {Array} elems_to_add - elements to be added (output)
* @param {Array} elems_to_add - edges to be added (output)
*/
function prepareElementForCopy(source_root_type, target_root_type, elem, target_tag_ids, elems_to_add, edges_to_add) {

  let element_prefix = 'element/';
  if (target_root_type == 'PROCEDURE') {
    element_prefix = 'procedureElement/';
  }
  let elem_id_new = uuid.v4();
  let elem_idd_new = element_prefix + elem_id_new;
  elem['elem_id'] = elem_id_new;
  elem['_key'] = elem_id_new;
  delete elem['_id'];
  delete elem['_version'];
  elem['conversations'] = [];

  if (isRedlineElement(elem)) {
    elem['procedure_modification'] = getProcedureModificationTemplate();
  } else {
    elem['procedure_modification'] = {};    
  }

  if (elem.elem_type == 'PROCEDURE_SECTION') {
    elem['imported'] = false;
    elem['child_execution_id'] = '';
  }

  // reset breakpoint
  elem['break_point'] = 'NONE';  
  
  // reset tags
  const tag_ids = [];
  // keep tags that exist in the target procedure version
  if (elem.tag_ids) {
    for (const tag_id of elem.tag_ids) {
      if (target_tag_ids.includes(tag_id)) {
        tag_ids.push(tag_id);
      }
    }
  }
  elem['tag_ids'] = tag_ids;
  
  // reset step execution data
  elem['executed'] = false;
  if (elem['elem_type'] == 'STEP') {
    if (elem.hasOwnProperty('execution')) {
      // reset meta data
      elem['execution']['meta_data']=deepcopy(execution_meta_data_template);
  
      // reset results using specification. We need to use specification
      // to handle enum values correctly.
      if (elem['specification'].hasOwnProperty('results')) {
        elem['execution']['results'] = deepcopy(elem['specification']['results']);
      } else {
        log.warning('prepareElementForCopy: Did not reset the results because step specification did not have results.');
      }    
    }
    elem['run_records'] = [];
  }

  // sanitize authoring_user_input or execution_user_input
  if (source_root_type == 'PROCEDURE' && target_root_type == 'EXECUTION') {
    if (elem.hasOwnProperty('authoring_user_input')) { 
      // Merge authoring and execution inputs if execution_user_input is define (should be based on specs).
      // Otherwise, simply copy authoring_user_input to execution_user_input.
      if (elem.hasOwnProperty('specification') && elem['specification'].hasOwnProperty('execution_user_input')) {
        // It is unfortunate that we need to introduce step specific logic here.
        // custom script has generic specs of inputs as placeholder for execution_user_input.
        // they must be excluded.
        if (elem.step_type === 'CUSTOM_SCRIPT') {
          elem['execution_user_input'] = extend(true, {}, elem['authoring_user_input'])
        } else {
          elem['execution_user_input'] = extend(true, {}, elem['specification']['execution_user_input'], elem['authoring_user_input'])
        }
      } else {
        elem['execution_user_input'] = extend(true, {}, elem['authoring_user_input']) 
      }
    }
  } else if (source_root_type == 'EXECUTION' && target_root_type == 'PROCEDURE') {

    if (elem.hasOwnProperty('execution_user_input')) {
      elem['authoring_user_input'] = deepcopy(elem['execution_user_input']);
      remove_execution_time_input_fields(elem);
    }

    if (elem.hasOwnProperty('specification') && elem['specification'].hasOwnProperty('execution_user_input')) {
      elem['execution_user_input'] = deepcopy(elem['specification']['execution_user_input']);
    } else {
      log.warning('prepareElementForCopy: Did not reset the execution_user_input because step specification did not have execution_user_input.');
    }
  }

  elems_to_add.push(elem);

  let edge = {'_from': elem.parent_idd, '_to': elem_idd_new, 'idx': elem.idx};
  edges_to_add.push(edge);

  if (elem.hasOwnProperty('children')) {
    for (let i = 0; i < elem.children.length; i++) {
      // need to update parent_idd for children
      elem.children[i].parent_idd = elem_idd_new;      
      prepareElementForCopy(source_root_type, target_root_type, elem.children[i], target_tag_ids, elems_to_add, edges_to_add);
    }
  }

  return elem;
}

function is_object(o) {
  return o instanceof Object && o.constructor === Object;
}

function remove_execution_time_input_fields(elem) {
  let authoring_user_input = elem['authoring_user_input'] || {};
  
  let authoring_user_input_specs = null;
  if (elem.hasOwnProperty('specification') && elem['specification'].hasOwnProperty('authoring_user_input')) {
    authoring_user_input_specs = elem['specification']['authoring_user_input'];
  } else {
    log.warning('prepareElementForCopy: Did not sanitize the authoring_user_input because step specification did not have authoring_user_input.');
    return;
  }

  let keys = Object.keys(authoring_user_input);
  keys.forEach((key) => {
    if (authoring_user_input_specs.hasOwnProperty(key)) {

      // handle nested object for environment manual step
      let prop = authoring_user_input[key];
      let prop_spec = authoring_user_input_specs[key];

      if (is_object(prop) && is_object(prop_spec)) {
        let prop_keys = Object.keys(prop);
        prop_keys.forEach((prop_key) => {
          if (!prop_spec.hasOwnProperty(prop_key)) {
            delete prop[prop_key];
          }
        });
      }
    } else {
      delete authoring_user_input[key];
    }
  });

  let entry_spec = {};
  if (authoring_user_input_specs.hasOwnProperty('entries') && (authoring_user_input_specs['entries'].length > 0)) {
    entry_spec = authoring_user_input_specs['entries'][0];
  }

  let entries = authoring_user_input['entries'] || [];
  entries.forEach((entry) => {
    let entry_keys = Object.keys(entry); 
    entry_keys.forEach((entry_key) => {
      if (!entry_spec.hasOwnProperty(entry_key)) {
        delete entry[entry_key];
      }      
    });
  });
}

/**
* Remove children field recursively
* 
* @param {Object} elem - element object
*/
function removeChildren(elem) {
  if (elem.hasOwnProperty('children')) {
    for (let i = 0; i < elem.children.length; i++) {
      removeChildren(elem.children[i]);
    }
    delete elem['children'];
  }

  return elem;
}

/**
 * parse error message from ArangoJS error
 *
 */
var get_sj_error_message = function(err) {
  if (err && err['response']) {
    if (err['response']['body']) {
      if (err['response']['body']['errorMessage']) {
        if (typeof err['response']['body']['errorMessage'] === 'string') {
          return err['response']['body']['errorMessage'];
        } else {
          return util.inspect(err['response']['body']['errorMessage']);
        }
      } else {
        return '';
      }   
    }
  }
  return util.inspect(err);
}

/**
 * A utility function to sleep
 * @param {Number} milisecs - time to sleep in milisec
 * @return {Promise}
*/
var wait_milisecs = function(milisecs) {
  return new Promise(function(resolve, reject) {
    setTimeout(function() {
      resolve(milisecs);
    }, milisecs)
  })
}

/**
 * Get the list of databases in Arango DB. This function will try to connect
 * to DB a few times before it gives up.
 *
 * @param {Number} count - how many times to try to connect to DB
 * @param {Number} milisecs - time to sleep in milisec for each trial
 * @return {Promise} A promise that will be fulfilled with the list of databases in Arango DB
*/
async function get_db_list(count, milisecs) {
  log.info(`Trying to connect to DB at ${config.db_url}. Remaining count: ${count} wait_milisecs: ${milisecs}`);

  if (count < 0) {
    return Promise.reject('Failed to connect db: ' + config.db_url);
  }

  db.useDatabase('_system');

  try {
    const names = await db.listUserDatabases();
    return Promise.resolve(names);
  } catch (err) {
    await wait_milisecs(milisecs);
    return get_db_list(count-1, milisecs);
  }  
}

/**
 * Reset "ingenium" database in Arango DB. If "ingenium" db already exists, it will be dropped and
 * a new "ingenium" DB will be created, and collections and graphs will be initialized.
 *
 * @return {Promise}
*/
async function reset_db() {
  log.info('Reset DB');
  db.useDatabase('_system');
  const names = await db.listDatabases();

  if (names.indexOf(database_name) > -1) {
    await db.dropDatabase(database_name);    
    log.info(`Database dropped: ${database_name}`);
    await init_db();
  } else {
    log.info(`Database not found. Create: ${database_name}`);
    await init_db();
  }
}

/**
 * Initialize "ingenium" database in Arango DB.
 * If "ingenium" db does not exist, create it, and initialize and collections and graphs.
 * If "ingenium" db already exists, do nothing.
 *
 * @return {Promise}
*/
async function init_db() {
  const names = await get_db_list(10, 4000);

  if(names.indexOf(database_name) == -1) {
    // create DB

    await db.createDatabase(database_name);

    log.debug(`Database was created: ${database_name}`);
    db.useDatabase(database_name);
    log.debug(`Use database: ${database_name}`);

    log.debug(`definitions.EXECUTION_GRAPH: ${definitions.EXECUTION_GRAPH}`);
    await db.graph(definitions.EXECUTION_GRAPH).create(
      [
        {
          collection: definitions.STEP_ORDER,
          from: [
            definitions.EXECUTION,
            definitions.ELEMENT
          ],
          to: [
            definitions.ELEMENT
          ]
        },
        {
          collection: definitions.REVISION,
          from: [
            definitions.ELEMENT
          ],
          to: [
            definitions.ELEMENT
          ]
        },
        {
          collection: definitions.RUN_RECORD,
          from: [
            definitions.ELEMENT
          ],
          to: [
            definitions.ELEMENT
          ]
        }
      ]
    );

    log.debug(`execution_graph created`);

    // Procedure graph db schema

    await db.graph(definitions.PROCEDURE_GRAPH).create(
      [
        {
          collection: definitions.PROCEDURE_STEP_ORDER,
          from: [
            definitions.PROCEDURE_VERSION,
            definitions.PROCEDURE_ELEMENT
          ],
          to: [
            definitions.PROCEDURE_ELEMENT
          ]
        },
        {
          collection: definitions.HAS_VERSION,
          from: [
            definitions.PROCEDURE
          ],
          to: [
            definitions.PROCEDURE_VERSION
          ]
        },          
      ]
    );

    log.debug(`procedure_graph created`);

    // Keep this to be able to restore old database backups
    await db.graph(definitions.HISTORY_GRAPH).create(
      [
        {
          collection: definitions.NEXT_RUN,
          from: [
            definitions.EXECUTION,
            definitions.ELEMENT
          ],
          to: [
            definitions.ELEMENT
          ]
        }
      ]
    );
    log.debug(`history_graph created`);

    await execution_id_gen_collection.create({'keyOptions': {'type': 'autoincrement', 'offset': 10001}});
    log.info('execution_id_gen collection created.');

    await procedure_id_gen_collection.create({'keyOptions': {'type': 'autoincrement', 'offset': 10001}})
    log.info('procedure_id_gen collection created.');

    await db.collection(definitions.VENUE_GROUP).create()
    const venue_group_id = uuid.v4()
    await venue_group_collection.save({'name': 'Default', 'description': 'Default venue group', 'status': 'ACTIVE', 'venue_group_id': venue_group_id, '_key': venue_group_id})

    await db.collection(definitions.VENUE).create()
    
    await db.collection(definitions.PROCEDURE_LABEL).create()
    log.info('procedureLabel collection created.');

    log.info('DB was initialized.');
  } else {
    db.useDatabase(database_name);
  }
}


/**
 * An internal function that is used to sort children of an element based on order.
 * This is a recursive function.
 * @param {Object} node - element
 *
 */
var sortChildren = function(node) {
  if (node['children']) {
    // sort by idx
    node['children'].sort(function(a, b) {return a['idx'] - b['idx']});
    
    for (let i=0; i < node['children'].length; i++) {
      let child = node['children'][i];
      if (i != child.idx) {
        log.error('INCONSISTENT ELEMENT ORDER sortChildren', {
          elem_id: child.elem_id,
          number: child.number,
          idx: child.idx,
          i: i          
        });         
      }      
    }
    
    node['children'].forEach(function(child) {
        sortChildren(child);
    });
  }

  if (node['run_records']) {
    // sort by idx
    node['run_records'].sort(function(a, b) {return a['idx'] - b['idx']});
  }  
}

/**
 * An internal function that is used to collect elem_ids and parent_ids from a nested structure.
 * This is a recursive function.
 * @param {Object} node - element
 * @param {Array} elem_ids - element ids
 * @param {Array} parent_ids - parent ids
 */
var collectElementIds = function(node, elem_ids, parent_ids) {
  if (node['elem_id']) {
    elem_ids.push(node['elem_id']);
    parent_ids.push(node['parent_id']);
  }
  
  if (node['children']) {
    node['children'].forEach(function(child) {
      collectElementIds(child, elem_ids, parent_ids);
    });
  }
}

/**
 * Update numbering of sections and steps recursively.
 *
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {Object} elem - Execution element
 * @param {String} number - New number for the element
 * @param {String} start_idx - Start index of child from which to update numbers.
 *  If an element is added a child, numbers do not change for the sibling elements before the new element.
 *  This parameter is used to skip updating numbers for sibling elements that come before the new element.
 * @param {Array} elems_to_update - array of elements whose numbers should be updated (output)
 * @param {Array} updated_numbers - array of elem_id and new number pairs (output)
 * @param {String} new_elem_idd - id of the new element including the collection name.
 * Used to exclude the new element from the list of elements whose numbers are changed.
 */

var update_number = function(root_type, elem, number, start_idx, elems_to_update, updated_numbers, new_elem_idd) {
  // this can happen if model is inconsistent
  if (elem == null) {
    log.error(`Cannot update number. Element not found. number: ${number}`);
    return;
  }
  
  // number can be null for execution
  if (number !== null) {
    if (elem['number'] != number) {
      elem['number'] = number;
      
      if ((new_elem_idd == null) || (elem._id != new_elem_idd)) {
        // update properties that may have been changed due to copy/move/delete
        let temp = {
          'number': number
        };

        if (elem.hasOwnProperty('procedure_modification_status')) {
          temp['procedure_modification_status'] = elem['procedure_modification_status'];
        }
        if (elem.hasOwnProperty('procedure_modification')) {
          temp['procedure_modification'] = elem['procedure_modification'];
        }
        if (elem.hasOwnProperty('run_for_score')) {
          temp['run_for_score'] = elem['run_for_score'];
        }
        if (elem.hasOwnProperty('procedure_section_id')) {
          temp['procedure_section_id'] = elem['procedure_section_id'];
        }
        if (elem.hasOwnProperty('procedure_id')) {
          temp['procedure_id'] = elem['procedure_id'];
        }        
        if (elem.hasOwnProperty('procedure_title')) {
          temp['procedure_title'] = elem['procedure_title'];
        }                                

        let elem_to_update = extend(true, {'_key': elem['_key']}, temp);
        let updated_number = extend(true, {'elem_id': elem['_key']}, temp);

        elems_to_update.push(elem_to_update);
        updated_numbers.push(updated_number);
      }
    }
  }

  if (elem.hasOwnProperty('children')) {
    
    let count = 0;
    let modify_count = 0; 
    let added_count = 0;  

    let procedure_reference_number = '';    // number as defined in procedure that is used as a reference to assign red line numbers  
    if (root_type == 'EXECUTION') {
      if (elem['procedure_section_id']) {
        // If we are already in a section that was added to an imported procedure, simply use the number 
        // If an element is inserted to the front, assume that it was added to number 0.
        if (elem['number'].includes('.')) {      
          procedure_reference_number = elem['number'];      
        } else {
          procedure_reference_number = elem['number'] + '-0';          
        }
      } else if (elem['elem_type'] == 'PROCEDURE_SECTION') {
        // If an element is inserted as the first elem of direct children of procedure section, 
        // assume that it was added to number 0.
        procedure_reference_number = '0'; 
      } else {
        // For other cases, procedure_reference_number will be handled below.
      }
    }

    for (let i = 0; i < elem.children.length; i++) {
      let child_elem = elem.children[i];

      if (child_elem['procedure_modification_status'] == definitions.PMS.ORIGINAL ||
        child_elem['procedure_modification_status'] == definitions.PMS.MODIFIED ||
        child_elem['procedure_modification_status'] == definitions.PMS.DELETED) {
        // reset counts to use "." notation relative to the previous step with fixed number from procedure
        modify_count = 0; 
        added_count = 0;
        // NOTE: need to update procedure_reference_number so that we can construct the number of a redline element
        // by appending to the number of the current procedure element.
        procedure_reference_number = child_elem['number'];
        // Do not change the child number. 
        // But need to call this since we may need to update the numbers of any nested non procedure elements
        update_number(root_type, child_elem, procedure_reference_number, 0, elems_to_update, updated_numbers, new_elem_idd);        
      } else if (child_elem['procedure_modification_status'] == definitions.PMS.MODIFYING_OLD || 
        child_elem['procedure_modification_status'] == definitions.PMS.MODIFYING) {
        modify_count++;
        if (i >= start_idx) {
          // 'a' is ASCII 97
          let child_number = procedure_reference_number + '.' + String.fromCharCode(96 + modify_count);
          update_number(root_type, child_elem, child_number, 0, elems_to_update, updated_numbers, new_elem_idd);
        }             
      } else if (child_elem['procedure_modification_status'] == definitions.PMS.ADDED) {
        added_count++;
        if (i >= start_idx) {
          let child_number = procedure_reference_number + '.' + added_count;
          update_number(root_type, child_elem, child_number, 0, elems_to_update, updated_numbers, new_elem_idd);             
        }                        
      } else if (child_elem['procedure_modification_status'] == definitions.PMS.NONE) {
        if (child_elem['procedure_section_id']) {
          added_count++;
          if (i >= start_idx) {
            let child_number = procedure_reference_number + '.' + added_count;                
            if (procedure_reference_number == '') {
              log.warning('procedure_reference_number was empty.', {
                root_type: root_type, 
                number: number, 
                start_idx: start_idx, 
                new_elem_idd: new_elem_idd,
                _id: elem._id,
                child_number: child_number
              });
            }
            update_number(root_type, child_elem, child_number, 0, elems_to_update, updated_numbers, new_elem_idd);             
          }             
        } else {
          count++;
          if (i >= start_idx) {
            let child_number = number ? (number + '-' + count) : ('' + count);                
            update_number(root_type, child_elem, child_number, 0, elems_to_update, updated_numbers, new_elem_idd);             
          }             
        }
      }
    }
  }
}

var get_root_specific_variables = function(root_type) {
  if (root_type == 'EXECUTION') {
    return {
      root_key_name: 'execution_id',
      graph_name: 'execution_graph',
      root_prefix: 'execution/',
      element_prefix: 'element/',
      step_order_prefix: 'stepOrder/',      
      run_record_prefix: 'runRecord/',
      element_collection: db.collection(definitions.ELEMENT),
      step_order_collection: db.collection(definitions.STEP_ORDER),     
      run_record_collection: db.collection(definitions.RUN_RECORD),
      user_input: 'execution_user_input'
    }
  } else if (root_type == 'PROCEDURE') {
    return {
      root_key_name: 'version_id',      
      graph_name: 'procedure_graph',
      root_prefix: 'procedureVersion/',
      element_prefix: 'procedureElement/',
      step_order_prefix: 'procedureStepOrder/',
      result_prefix: null, // not applicable
      run_record_prefix: null,   
      element_collection: db.collection(definitions.PROCEDURE_ELEMENT),
      step_order_collection: db.collection(definitions.PROCEDURE_STEP_ORDER),     
      run_record_collection: null,
      user_input: 'authoring_user_input'      
    }    
  } else {
    throw new Error('Invalid root type. Should be "PROCEDURE" or "EXECUTION". Actual: {0}'.format(root_type));
  }  
}

/**
 * Collect lists of graph vertices and edges that will be deleted when an element is deleted.
 * This is an internal function. This function is used when an element is deleted to ensure
 * deleting related vertices and edges that should be deleted as well.
 *
 * @param {Object} elem - element to delete
 * @param {Object} elems_to_delete - graph vertices to delete (output)
 * @param {Object} edges_to_delete - graph edges to delete (output)
 * @param {Object} edges_dict - dict from elem_idd to edge

 */
var delete_vertex = function(elem, elems_to_delete, edges_to_delete, edges_dict) {
  elems_to_delete.push(elem);
  if (edges_dict.hasOwnProperty(elem._id)) {
    let edge = edges_dict[elem._id];
    edges_to_delete.push(edge);
  }

  if (elem.hasOwnProperty('results')) {
    for (let i=0; i < elem.results.length; i++) {
      let result = elem.results[i];
      elems_to_delete.push(result);
      let edge = edges_dict[result._id];
      edges_to_delete.push(edge);
    }
  }

  if (elem.hasOwnProperty('children')) {
    for (let i=0; i < elem.children.length; i++) {
      let child = elem.children[i];
      delete_vertex(child, elems_to_delete, edges_to_delete, edges_dict);
    }
  }
}


/**
 * Add an element to execution or a procedure version
 *
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} root_id - Unique id of execution or procedure version
 * @param {Object} input_elem - Element to add
 * @param {String} insert_after_id - id of an element after which new element will be added.
 *                 Use "-1" to insert as the first element.
 * @param {String} level - Relationship of the new element with respect to "insert_after_id".
 *                 Either CHILD or SIBLING.
 * @return {Promise} promise that will be fulfilled with the new element and the
 * list of elements whose numbers were changed.
 */
var addElement = async function(root_type, root_id, input_elem, insert_after_id, level) {
  let var_dict = get_root_specific_variables(root_type);
  let root_idd = var_dict.root_prefix + root_id;
  let elem_type = input_elem['elem_type'];
  let key = uuid.v4();
  let elem = null;

  let elem_def0 = {
    'elem_id': key,
    '_key': key,
    'title': '',
    'description': '',
    'files': [],
    'conversations': [],
    'tag_ids': [],
    'number': '',
    'procedure_modification': {},
    'execution_id': '', 
    'executed': false,       
    'procedure_id': '',
    'procedure_title': '',    
    'procedure_section_id': '',
    'run_for_score': false,
    'break_point': 'NONE',
    'procedure_modification_status': 'NONE'
  };

  elem_def0[var_dict.root_key_name] = root_id;
  let elem_def = null;
  
  if (elem_type == 'PARAGRAPH') {
    elem_def = {
      'elem_type': 'PARAGRAPH',
      'executable': 'NONE',
      'verifiable': false
    }
  }
  else if (elem_type == 'SECTION') {
    elem_def = {
      'elem_type': 'SECTION',
      'executable': 'NONE',
      'verifiable': false    
    }
  }
  else if (elem_type == 'PROCEDURE_SECTION') {
    elem_def = {
      'elem_type': 'PROCEDURE_SECTION',
      'executable': 'NONE',
      'verifiable': false,   
      'imported': false,
      'child_execution_id': '',
      'authoring_user_input': {},
      'execution_user_input': {}
    }
  }
  else if (elem_type == 'STEP') {
    elem_def = {
      'elem_type': 'STEP',    
      'executable': 'EXECUTED',    // default value that will be overwritten by core
      'verifiable': true,          // default value that will be overwritten by core
      'step_type': '',
      'variable': {},
      'code': {},
      'guard': '',
      'notices': [],
      'specification': {},
      'authoring_user_input': {},
      'execution_user_input': {},
      'execution': {},
      'run_records': []   
    }
  }
  else {
    return Promise.reject('Unrecognized element type: {0}'.format(elem_type))
  }

  elem = extend(true, {}, elem_def0, elem_def, input_elem);

  //
  let elem_id = elem.elem_id;
  let elem_idd = var_dict.element_prefix + elem_id;
  elem._id = elem_idd;

  let new_edge = null;

  let target_parent_id = null;   // db key of the parent element
  let target_parent_idd = null;  // db id of the parent element
  let target_parent = null;

  let target_idx = 0;            // index at the level of insertion

  let elem_dict = {};
  let edge_dict = {};    // dict from elem_idd to edge


  let edges_to_update = {};
  let elems_to_update = [];
  let updated_numbers = [];

  let cursor = null;
  let edges = null;
  let res = null;

  if (insert_after_id == '-1') {
    // insert at the front of the execution
    target_parent_id = root_id;
    target_parent_idd = var_dict.root_prefix + root_id;
  } else {
    if (level == 'CHILD') {
      target_parent_id = insert_after_id;
      target_parent_idd = var_dict.element_prefix + insert_after_id;
    } else {
      // SIBLING is default
      try {
        cursor = await var_dict.step_order_collection.byExample({'_to': var_dict.element_prefix + insert_after_id});
        edges = await cursor.all();
      } catch (err) {
        return Promise.reject('Failed to get target parent from DB: ' + get_sj_error_message(err));
      }

      if (edges.length == 0) {
        let msg = 'No parent was found for elem_id: {0}'.format(elem_id);
        log.error(msg);
        return Promise.reject(msg);
      } else {
        target_parent_id = edges[0]._from.split('/')[1];
        target_parent_idd = edges[0]._from;
      }
    }
  }

  try {
    log.trace(`target_parent_idd: ${target_parent_idd}`);
    cursor = await db.query(
      `
      FOR vertex, edge
        IN 0..10000
        OUTBOUND '${target_parent_idd}'
        GRAPH '${var_dict.graph_name}'
        OPTIONS {bfs: true}
        RETURN {
            v: vertex,
            e: edge
        }
      `,
      {},
      {count: true}
    );
    res = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get elements of target parent from DB: ' + get_sj_error_message(err));
  }
  
  if (res.length > 0) {
    target_parent = res[0].v;
  }

  if (target_parent == null || target_parent._id == null) {
    return Promise.reject('Element was not found. insert_after_id: {0}'.format(insert_after_id));
  }

  if (target_parent[var_dict.root_key_name] != root_id) {
    return Promise.reject('Target element does not belong to {0}. target parent: {1} root_id: {2}'.format(var_dict.root_key_name, target_parent[var_dict.root_key_name],
      root_id));
  }

  if (root_type == 'PROCEDURE') {
    if (target_parent.elem_type == 'PROCEDURE_SECTION') {
      return Promise.reject('Cannot add element to procedure section during authoring');
    }
  }

  if (target_parent['elem_type'] == 'STEP') {
    return Promise.reject('Element cannot be added to a step: {0}'.format(target_parent._key));
  } else if (target_parent['elem_type'] == 'PARAGRAPH') {
    return Promise.reject('Element cannot be added to a paragraph: {0}'.format(target_parent._key));
  }

  for (let entry of res) {
    let vertex = entry.hasOwnProperty('v') ? entry.v : null;
    let edge = entry.hasOwnProperty('e') ? entry.e : null;

    elem_dict[vertex._id] = vertex;
    edge_dict[vertex._id] = edge;

    if (edge != null) {
      if (edge._id.startsWith(var_dict.step_order_prefix)) {
        let parent = elem_dict[edge._from];
        if (!parent.hasOwnProperty('children')) {
          parent.children = [];
        }
        vertex.idx = edge['idx'];
        parent.children.push(vertex);
      }
    }
  }

  // sort
  sortChildren(target_parent);
  log.trace('sortChildren done');
  
  target_idx = get_target_idx(target_parent, insert_after_id, level);

  // update idx for the current siblings

  if (!target_parent.hasOwnProperty('children')) {
    target_parent.children = [];
  }

  elem['idx'] = target_idx;

  // Update procedure meta data based on the new parent
  setProcedureMetaData(elem, target_parent, false);

  // Determine run for score

  if (isInRunForScore(target_parent)) {
    if (target_idx > 0) {
      let preceding_elem = target_parent.children[target_idx-1];
      if (preceding_elem['procedure_modification_status'] == 'MODIFIED') {
        return Promise.reject('Cannot add a new element among modified elements.');
      } else if (preceding_elem['procedure_modification_status'] == 'MODIFYING_OLD') {
        return Promise.reject('Cannot add a new element among modified elements.');
      }
    }

    elem['run_for_score'] = true;
    elem['procedure_modification_status'] = definitions.PMS.ADDED;
    elem['procedure_modification'] = getProcedureModificationTemplate();
    if (elem['elem_type'] === 'PROCEDURE_SECTION') {
      // If a procedure is added to R4R area, the child procedure needs to be R4R as well.
      elem['execution_user_input']['run_for_score'] = true
    }
  } else {
    elem['run_for_score'] = false;
    elem['procedure_modification_status'] = definitions.PMS.NONE;
  }    
          
  new_edge = {'_from': target_parent_idd, '_to': elem_idd, 'idx': target_idx};

  // update dicts
  elem_dict[elem._id] = elem;
  edge_dict[elem._id] = new_edge;

  // insert new element to tree structure
  target_parent.children.splice(target_idx, 0, elem);
  
  // collect edges to update
  prepare_sibling_edges(target_parent, edge_dict, edges_to_update, null, null);

  let child = elem_dict[elem_idd];

  if (elem_dict.hasOwnProperty(target_parent_idd)) {

    let parent_number = target_parent.hasOwnProperty('number') ? target_parent['number'] : null;
    //
    update_number(root_type, target_parent, parent_number, target_idx, elems_to_update, updated_numbers, null);

    sanitizeElement(target_parent);

    //log.trace(`update_number done. elem: ${JSON.stringify(elem)}`);
    //log.trace(`new_edge: ${JSON.stringify(new_edge)}`);
    //log.trace(`elems_to_update: ${JSON.stringify(elems_to_update)}`);
    //log.trace(`edges_to_update: ${JSON.stringify(edges_to_update)}`);
    //log.trace(`updated_numbers: ${JSON.stringify(updated_numbers)}`);

    try {
      await var_dict.element_collection.save(elem);
      await var_dict.step_order_collection.save(new_edge);
      await var_dict.element_collection.updateAll(elems_to_update);
      await var_dict.step_order_collection.updateAll(Object.values(edges_to_update));
    } catch (err) {
      return Promise.reject('Failed to get save element in DB: ' + get_sj_error_message(err));
    }

    const {elem_ids, parent_ids} = await getElementIds(root_type, root_idd);
        
    elem = sanitize_internal_attrs(elem);
    // Include target_parent_id of the new element in the response
    elem['parent_id'] = target_parent_idd.startsWith(var_dict.root_prefix) ? '' : target_parent_id;
    
    return Promise.resolve({'elem': elem, 'numbers': updated_numbers, 'elem_ids': elem_ids});
  }
  else {
    return Promise.reject('Element is not found: {0}'.format(target_parent_idd));
  }    
}

/**
 * Move an element
 *
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} root_id - Unique id of execution or procedure version
 * @param {Object} source_elem_ids - ids of elements to move
 * @param {String} insert_after_id - id of an element after which the element will be moved.
 *                 Use "-1" to insert as the first element.
 * @param {String} level - Relationship of the element with respect to "insert_after_id".
 *                 Either CHILD or SIBLING.
 * @return {Promise} promise that will be fulfilled with the
 * list of elements whose numbers were changed.
 */
var moveElement = async function(root_type, root_id, source_elem_ids, insert_after_id, level) {
  log.debug(`moveElement root_type: ${root_type} root_id: ${root_id} source_elem_ids: ${source_elem_ids} insert_after_id: ${insert_after_id} level: ${level}`);

  let var_dict = get_root_specific_variables(root_type);  

  let root_idd = var_dict.root_prefix + root_id;

  const elems = [];     // elements to move
  let elem_idds = source_elem_ids.map(elem_id => var_dict.element_prefix + elem_id);
  let elem_idds_map = {};
  for (const elem_idd of elem_idds) {
    elem_idds_map[elem_idd] = elem_idd;
  }


  let target_parent_id = null;      // target parent id
  let target_parent_idd = null;     // target parent idd
  let target_parent = null;
  let target_idx = 0;            // index at the level of insertion

  let elem_dict = {};
  let edge_dict = {};    // dict from elem_idd to edge
  let root_node = null;

  let elems_to_update = [];
  let edges_to_update = {};   // needs to be an obj (dictionary) since the same edge may be found to be updated more than once.
  let updated_numbers = [];

  let cursor = null;
  let edges = null;

  if (insert_after_id == '-1') {
    // insert at the front of the execution
    target_parent_id = root_id;
    target_parent_idd = var_dict.root_prefix + root_id;
  } else {
    if (level == 'CHILD') {
      target_parent_id = insert_after_id;
      target_parent_idd = var_dict.element_prefix + insert_after_id;
    } else {
      // SIBLING is default
      // Find the target parent
      try {
        cursor = await var_dict.step_order_collection.byExample({'_to': var_dict.element_prefix + insert_after_id});
        edges = await cursor.all();
      } catch (err) {
        return Promise.reject('Failed to get target parent from DB: ' + get_sj_error_message(err));
      }

      if (edges.length == 0) {
        let msg = 'No parent was found for insert_after_id: {0}'.format(insert_after_id);
        log.error(msg);
        return Promise.reject(msg);
      } else {
        target_parent_id = edges[0]._from.split('/')[1];
        target_parent_idd = edges[0]._from;
      }
    }
  }

  log.trace(`target_parent_idd: ${target_parent_idd}`);

  if (target_parent_idd == null) {
    return Promise.reject(`Target parent was not found. target_parent_idd: ${target_parent_idd}`);
  }

  // check if the target parent exists
  if (target_parent_idd.startsWith(var_dict.element_prefix)) {
    let docs = null;
    try {
      docs = await var_dict.element_collection.lookupByKeys([target_parent_id]);
    } catch (err) {
      return Promise.reject('Failed to get target parent element in DB: ' + get_sj_error_message(err));
    }

    if (docs.length > 1) {
      return Promise.reject(`More than one parent element exists. target_parent_id: ${target_parent_id}`);
    } else if (docs.length == 0) {
      return Promise.reject(`Parent element does not exist. target_parent_id: ${target_parent_id}`);
    }

    let parent_elem = docs[0];
    if (parent_elem['elem_type'] == 'PARAGRAPH') {
      return Promise.reject(`Cannot add element to a paragraph. target_parent_id: ${target_parent_id}`);
    } else if (parent_elem['elem_type'] == 'STEP') {
      return Promise.reject(`Cannot add element to a step. target_parent_id: ${target_parent_id}`);
    }

    if (docs[0][var_dict.root_key_name] != root_id) {
      return Promise.reject(`Element does not belong to ${root_type}. root_id: ${root_id}`);
    }
  } else if (target_parent_idd.startsWith(var_dict.root_prefix)) {
    // do nothing
  } else {
    return Promise.reject(`Invalid parent type: ${target_parent_idd}`);
  }

  log.trace('build tree');
  log.trace(`root_idd: ${root_idd}`);

  root_node = await buildElementTree(var_dict, root_idd, elem_dict, edge_dict);

  if (elem_dict.hasOwnProperty(target_parent_idd)) {
    target_parent = elem_dict[target_parent_idd];
  } else {
    return Promise.reject('target_parent was not found. target_parent_idd: {0}'.format(target_parent_idd));
  }         

  if (isInRunForScore(target_parent)) {
    return Promise.reject('Cannot move an element into run for score area.');
  }
  
  // prevent from pasting into area that will be cut
  for (const elem_idd of elem_idds) {
    let target_anscestor_idd = target_parent_idd;
    let target_anscestor = target_parent;
    log.trace(`moveElement elem_idd: ${elem_idd}`);
    log.trace(`moveElement target_anscestor_idd: ${target_anscestor_idd}`);
    while (target_anscestor) {
      if (target_anscestor_idd == elem_idd) {
        return Promise.reject('Cannot move an element to itself or its child');
      }
      target_anscestor_idd = target_anscestor.parent_idd;
      log.trace(`moveElement target_anscestor_idd: ${target_anscestor_idd}`);
      if (elem_dict.hasOwnProperty(target_anscestor_idd)) {
        target_anscestor = elem_dict[target_anscestor_idd];      
      } else {
        target_anscestor = null;
      }
    }
  }

  //// find elements to copy

  // idds according to the elements order
  const sorted_idds = [];
  sort_element_idds(elem_idds_map, root_node, sorted_idds);

  if (sorted_idds.length === 0) {
    return Promise.reject('Element was not found to move');
  }

  // find elements at the top level
  const elem_map = {};
  for (const elem_idd of sorted_idds) {
    if (elem_dict.hasOwnProperty(elem_idd)) {
      elem_map[elem_idd] = elem_dict[elem_idd];
    } else {
      return Promise.reject('element was not found: {0}'.format(elem_idd));
    }
  }

  for (const [elem_idd, elem] of Object.entries(elem_map)) {
    let parent_idd = elem.parent_idd;
    // will be true if the selected element is a child of another selected element
    let is_child = false;
    while (parent_idd) {
      if (elem_map.hasOwnProperty(parent_idd)) {
        is_child = true;
        break;
      } else {
        let parent = elem_dict[parent_idd];
        parent_idd = parent ? parent.parent_idd : '';
      }
    }
    if (!is_child) {
      elems.push(elem);
    }
  }
  ////
  for (const elem of elems) {
    let elem_idd = elem._id;
    let source_idx = 0;

    // cut the source element
    if (elem_dict.hasOwnProperty(elem_idd)) {
      source_idx = elem.idx;
    } else {
      return Promise.reject('element was not found: {0}'.format(elem_idd));
    }

    if (elem['run_for_score']) {
      return Promise.reject('Cannot move an element from run for score area.');
    }

    // update idx for the current siblings
    let source_parent = elem_dict[elem.parent_idd];

    // this may happen for execution
    if (!source_parent.hasOwnProperty('children')) {
      source_parent.children = [];
    }
    source_parent.children.splice(source_idx, 1);

    prepare_sibling_edges(source_parent, edge_dict, edges_to_update, null, null);
  }

  // insert to the target location
  target_idx = get_target_idx(target_parent, insert_after_id, level);

  for (const [i, elem] of elems.entries()) {
    let elem_idd = elem._id;
    
    if (!elem_dict.hasOwnProperty(elem_idd)) {
      return Promise.reject('element was not found: {0}'.format(elem_idd));
    }

    if (edge_dict.hasOwnProperty(elem._id)) {
      let edge_to_rewire = edge_dict[elem._id];
      edge_to_rewire['_from'] = target_parent_idd;
      edge_to_rewire['idx'] = target_idx + i;
      edges_to_update[elem._id] = edge_to_rewire;
  
      // insert to children
      if(target_parent.children == undefined) {
        target_parent.children = [];
      }
      
      elem['idx'] = target_idx + i;
  
      // Update procedure meta data based on the new parent            
      setProcedureMetaData(elem, target_parent, true); 
      // reset numbers so that the numbers will be regenerated
      resetElemNumber(elem, true);    
      
      if (isInRunForScore(target_parent)) {
        // this should not happen
        return Promise.reject('Cannot move an element into run for score area.');
      } else {
        setRunForScoreMetaData(elem, false, definitions.PMS.NONE, {}, true);              
      }                 
      // insert at the target idx
      target_parent.children.splice(target_idx + i, 0, elem);
      
      // collect edges to update
      prepare_sibling_edges(target_parent, edge_dict, edges_to_update, null, null);
     
    }
  }


  log.trace('Update data in db');
  // need to check from the root since numbers may change in the source location as well

  let root = elem_dict[root_idd];
  let root_number = root.hasOwnProperty('number') ? root['number'] : null;
  //
  update_number(root_type, root, root_number, 0, elems_to_update, updated_numbers, null);
  sanitizeElement(root);


  try {
    await var_dict.element_collection.updateAll(elems_to_update);
    await var_dict.step_order_collection.updateAll(Object.values(edges_to_update));
  } catch (err) {
    return Promise.reject('Failed to get update elements in DB: ' + get_sj_error_message(err));
  }

  const {elem_ids, parent_ids} = await getElementIds(root_type, root_idd);
  return Promise.resolve({'numbers': updated_numbers, 'elem_ids': elem_ids, 'parent_ids': parent_ids});
}

/**
 * Build element tree for a procedure version or an execution
 *
 * @param {Object} var_dict - dictionary of variables depending on procedure or execution
 * @param {String} root_idd - unique id of the root (procedure version or execution)
 * @param {Object} elem_dict - map from _id to element
 * @param {Object} edge_dict - map from _id to edge
 * @return {Promise} promise that will be fulfilled with the root element
 */
var buildElementTree = async function(var_dict, root_idd, elem_dict, edge_dict) {
  log.trace(`build tree root_idd: ${root_idd}`);
  let res = null;
  let root_node = null;

  try {
    let cursor = await db.query(
      `
      FOR vertex, edge
        IN 0..10000
        OUTBOUND '${root_idd}'
        GRAPH '${var_dict.graph_name}'
        OPTIONS {bfs: true}
        RETURN {v: vertex, e: edge}
      `,
      {},
      {count: true}
    );
    res = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get elements from DB: ' + get_sj_error_message(err));
  }

  if (res.length > 0) {
    root_node = res[0].v;
  }

  for (let entry of res) {
    let vertex = entry.hasOwnProperty('v') ? entry.v : null;
    let edge = entry.hasOwnProperty('e') ? entry.e : null;

    elem_dict[vertex._id] = vertex;
    edge_dict[vertex._id] = edge;

    if (edge != null) {
      if (edge._id.startsWith(var_dict.step_order_prefix)) {
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

  return Promise.resolve(root_node);
}



/**
 * Copy an element
 *
 * @param {String} source_root_type - EXECUTION or PROCEDURE
 * @param {String} target_root_type - EXECUTION or PROCEDURE
 * @param {Object} source_elem_ids - ids of elements to copy 
 * @param {String} target_root_id - Unique id of the target execution or target procedure version
 * @param {String} insert_after_id - id of an element after which the element will be moved.
 *                 Use "-1" to insert as the first element.
 * @param {String} level - Relationship of the element with respect to "insert_after_id".
 *                 Either CHILD or SIBLING.
 * @return {Promise} promise that will be fulfilled with the copied elements and the
 * list of elements whose numbers were changed.
 */
var copyElement = async function(source_root_type, target_root_type, source_root_id, source_elem_ids, 
  target_root_id, insert_after_id, level) {
  log.debug(`copyElement source_root_type: ${source_root_type} target_root_type: ${target_root_type} source_root_id: ${source_root_id}` + 
    ` source_elem_ids: ${source_elem_ids} target_root_id: ${target_root_id} insert_after_id: ${insert_after_id} level: ${level}`);

  let source_var_dict = get_root_specific_variables(source_root_type);
  let target_var_dict = get_root_specific_variables(target_root_type);

  let source_root_idd = source_var_dict.root_prefix + source_root_id;
  let target_root_idd = target_var_dict.root_prefix + target_root_id;

  let source_elems = [];     // elements to copy
  let source_elem_idds = source_elem_ids.map(source_elem_id => source_var_dict.element_prefix + source_elem_id);
  let source_elem_idds_map = {};
  for (const source_elem_idd of source_elem_idds) {
    source_elem_idds_map[source_elem_idd] = source_elem_idd;
  }

  let target_parent = null;
  let target_parent_id = null;      // target parent id
  let target_parent_idd = null;     // target parent idd

  let target_idx = 0;            // index at the level of insertion

  let source_elem_dict = {};
  let source_edge_dict = {};    // dict from elem_idd to edge

  let target_elem_dict = {};
  let target_edge_dict = {};    // dict from elem_idd to edge

  let elems_to_add = [];
  let elems_to_update = [];
  let edges_to_update = {};
  let edges_to_add = [];
  let updated_numbers = [];

  let cursor = null;
  let edges = null;
  let res = null;

  if (insert_after_id == '-1') {
    // insert at the front of the execution
    target_parent_id = target_root_id;
    target_parent_idd = target_var_dict.root_prefix + target_root_id;
  } else {
    if (level == 'CHILD') {
      target_parent_id = insert_after_id;
      target_parent_idd = target_var_dict.element_prefix + insert_after_id;
    } else {
      // SIBLING is default
      // Find the target parent

      try {
        let cursor = await target_var_dict.step_order_collection.byExample({'_to': target_var_dict.element_prefix + insert_after_id});
        edges = await cursor.all();
      } catch (err) {
        return Promise.reject('Failed to get target parent from DB: ' + get_sj_error_message(err));
      }

      if (edges.length == 0) {
        let msg = 'No parent was found for insert_after_id: {0}'.format(insert_after_id);
        log.error(msg);
        return Promise.reject(msg);
      } else {
        target_parent_id = edges[0]._from.split('/')[1];
        target_parent_idd = edges[0]._from;
      }
    }
  }
  

  log.trace(`target_parent_idd: ${target_parent_idd}`);
  if (target_parent_idd == null) {
    return Promise.reject('Target parent was not found. target_parent_idd: %s'.format(target_parent_idd));
  }      

  // check if the target parent exists
  if (target_parent_idd.startsWith(target_var_dict.element_prefix)) {
    let docs = null;
    try {
      docs = await target_var_dict.element_collection.lookupByKeys([target_parent_id]);
    } catch (err) {
      return Promise.reject('Failed to get target parent element from DB: ' + get_sj_error_message(err));
    }

    if (docs.length > 1) {
      return Promise.reject('More than one parent element exists. target_parent_id: {0}'.format(target_parent_id));
    } else if (docs.length == 0) {
      return Promise.reject('Parent element does not exist. target_parent_id: {0}'.format(target_parent_id));
    }

    let parent_elem = docs[0];
    if (parent_elem['elem_type'] == 'PARAGRAPH') {
      return Promise.reject('Cannot add element to a paragraph. target_parent_id: {0}'.format(target_parent_id));
    } else if (parent_elem['elem_type'] == 'STEP') {
      return Promise.reject('Cannot add element to a step. target_parent_id: {0}'.format(target_parent_id));
    }

    if (docs[0][target_var_dict.root_key_name] != target_root_id) {
      return Promise.reject('Element does not belong to target. target_root_id: {0}'.format(target_root_id));
    }
  } else if (target_parent_idd.startsWith(target_var_dict.root_prefix)) {
    // do nothing
  } else {
    return Promise.reject('Invalid parent type: {0}'.format(target_parent_idd));
  }

  let target_root_node = await buildElementTree(target_var_dict, target_root_idd, target_elem_dict, target_edge_dict);

  if (target_elem_dict.hasOwnProperty(target_parent_idd)) {
    target_parent = target_elem_dict[target_parent_idd];
  } else {
    return Promise.reject('target_parent was not found. target_parent_idd: {0}'.format(target_parent_idd));
  }                 

  if (target_root_type == 'PROCEDURE') {
    if (target_parent.elem_type == 'PROCEDURE_SECTION') {
      return Promise.reject('Cannot add element to procedure section during authoring');
    }
  }

  if (target_parent['elem_type'] == 'STEP') {
    return Promise.reject('Element cannot be added to a step: {0}'.format(target_parent._key));
  } else if (target_parent['elem_type'] == 'PARAGRAPH') {
    return Promise.reject('Element cannot be added to a paragraph: {0}'.format(target_parent._key));
  }

  // only procedure version has tags
  const target_tag_ids = target_root_node.tags ? target_root_node.tags.map(tag => tag.tag_id) : [];

  // Find the target index
  target_idx = get_target_idx(target_parent, insert_after_id, level);


  log.trace(`target_idx: ${target_idx}`);  

  //// find elements to copy
  let source_root_node = null;
  if (source_root_idd == target_root_idd) {
    source_root_node = target_root_node;
    source_elem_dict = target_elem_dict;
    source_edge_dict = target_edge_dict;
  } else {
    source_root_node = await buildElementTree(source_var_dict, source_root_idd, source_elem_dict, source_edge_dict);  
  }

  // idds according to the elements order
  const sorted_idds = [];
  sort_element_idds(source_elem_idds_map, source_root_node, sorted_idds);

  if (sorted_idds.length === 0) {
    return Promise.reject('Element was not found to copy');
  }

  // find elements at the top level
  const source_elem_map = {};
  for (const source_elem_idd of sorted_idds) {
    if (source_elem_dict.hasOwnProperty(source_elem_idd)) {
      source_elem_map[source_elem_idd] = source_elem_dict[source_elem_idd];
    } else {
      return Promise.reject('source element was not found: {0}'.format(source_elem_idd));
    }
  }

  for (const [source_elem_idd, source_elem] of Object.entries(source_elem_map)) {
    let parent_idd = source_elem.parent_idd;
    // will be true if the selected element is a child of another selected element
    let is_child = false;
    while (parent_idd) {
      if (source_elem_map.hasOwnProperty(parent_idd)) {
        is_child = true;
        break;
      } else {
        let parent = source_elem_dict[parent_idd];
        parent_idd = parent ? parent.parent_idd : '';
      }
    }
    if (!is_child) {
      source_elems.push(source_elem);
    }
  }

  // insert to children
  if(!target_parent.hasOwnProperty('children')) {
    target_parent.children = [];
  }

  for (const [i, source_elem] of source_elems.entries()) {
    // Exclude children of procedure sections
    removeProcedureSectionChildren(source_elem);
    let elem_copy = extend(true, {}, source_elem);

    elem_copy['idx'] = target_idx + i;
    elem_copy['parent_idd'] = target_parent_idd;
  
    // Determine if the element is added to a procedure section
    setProcedureMetaData(elem_copy, target_parent, true);
    // reset numbers so that the numbers will be regenerated
    resetElemNumber(elem_copy, true);
  
    if (isInRunForScore(target_parent)) {
  
      if ((elem_copy['elem_type'] == 'PROCEDURE_SECTION') && elem_copy['imported']) {
        return Promise.reject('Cannot copy a procedure section that has been imported into a protected area of run for score');
      }
  
      if (target_idx > 0) {
        let preceding_elem = target_parent.children[target_idx-1];
        if (preceding_elem['procedure_modification_status'] == 'MODIFIED') {
          return Promise.reject('Cannot add a new element among modified elements.');
        } else if (preceding_elem['procedure_modification_status'] == 'MODIFYING_OLD') {
          return Promise.reject('Cannot add a new element among modified elements.');
        }
      }
      setRunForScoreMetaData(elem_copy, true, definitions.PMS.ADDED, getProcedureModificationTemplate(), true);
    } else {
      setRunForScoreMetaData(elem_copy, false, definitions.PMS.NONE, {}, true);
    }
  
    // insert at the target idx
    target_parent.children.splice(target_idx + i, 0, elem_copy);
  
    prepareElementForCopy(source_root_type, target_root_type, elem_copy, target_tag_ids, elems_to_add, edges_to_add);
  }

  // collect edges to update
  // pass in target_idx not to include the edge of the copied element, which is
  // to be created from "edges_to_add"
  prepare_sibling_edges(target_parent, target_edge_dict, edges_to_update, target_idx, source_elems.length);

  log.trace('Update data in db');

  let parent_number = target_parent.hasOwnProperty('number') ? target_parent['number'] : null;
  //
  update_number(target_root_type, target_parent, parent_number, 0, elems_to_update, updated_numbers, null);

  sanitizeElement(target_parent); 

  // delete children since we need a flat list
  elems_to_add = elems_to_add.map(elem => {delete elem['children']; return elem});

  // Do not add parent_id to db
  let elems_to_add_for_db = elems_to_add.map(elem => {
    // make a copy
    let elem_for_db = extend(true, {}, elem);
    delete elem_for_db['parent_id']; 
    return elem_for_db;
  });

  // First add new elements since the new elements may be included in elems_to_update if their numbers are changed.
  res = await target_var_dict.element_collection.import(elems_to_add_for_db, {'type': 'documents'});

  try {
    await target_var_dict.element_collection.updateAll(elems_to_update);
    await target_var_dict.step_order_collection.import(edges_to_add, {'type': 'documents'});
    await target_var_dict.step_order_collection.updateAll(Object.values(edges_to_update));
  } catch (err) {
    return Promise.reject('Failed to update elements in DB: ' + get_sj_error_message(err));
  }

  const {elem_ids, parent_ids} = await getElementIds(target_root_type, target_root_idd);

  for (let i=0; i < elems_to_add.length; i++) {
    sanitize_internal_attrs(elems_to_add[i]);
  }
  return Promise.resolve({'elements': elems_to_add, 'numbers': updated_numbers, 'elem_ids': elem_ids});
}

/**
 * Get vertices and edges of a procedure or an execution
 * Vertices and edges may belong to different document and edge collections
 * 
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} root_idd - id of execution or element including collection name.
 *                            For example, 'execution/id-123' or 'element/id-432'
*/
var getVerticesEdges = async function (root_type, root_idd) {
  let var_dict = get_root_specific_variables(root_type);

  var vertices = [];
  var edges = [];

  let cursor = null;
  let res = null;

  try {
    cursor = await db.query(
      `
      FOR vertex, edge
        IN 0..10000
        OUTBOUND '${root_idd}'
        GRAPH '${var_dict.graph_name}'
        OPTIONS {bfs: true}
        RETURN {v: vertex, e: edge}
      `,
      {},
      {count: true}
    );
    res = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get elements graph from DB: ' + get_sj_error_message(err));
  }

  for (const entry of res) {
    let vertex = entry.hasOwnProperty('v') ? entry.v : null;
    let edge = entry.hasOwnProperty('e') ? entry.e : null;

    if (vertex && edge) {
      vertices.push(vertex);
      edges.push(edge);
    }
  }

  return Promise.resolve({edges: edges, vertices: vertices});
}

/**
 * Get hierarchical json structure of execution or procedure. The json structure will include sections
 * and steps. The root can be an execution/procedure or an element.
 * 
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} root_idd - id of execution or element including collection name.
 *                            For example, 'execution/id-123' or 'element/id-432'
 * @param {Boolean} simple - true to return only essential fields such as elem_id and elem_type
*/
var getStructure = async function (root_type, root_idd, simple) {
  let var_dict = get_root_specific_variables(root_type);
  
  var root_node = null;
  var dict = {};

  let cursor = null;
  let res = null;

  try {
    if (simple) {
      cursor = await db.query(
        `
        FOR vertex, edge
          IN 0..10000
          OUTBOUND '${root_idd}'
          GRAPH '${var_dict.graph_name}'
          OPTIONS {bfs: true}
          FILTER !CONTAINS(edge._id, '${var_dict.run_record_prefix}')
          RETURN {
            v: {
              _id: vertex._id,
              _key: vertex._key,
              elem_id: vertex.elem_id,
              number: vertex.number,
              title: vertex.title,
              elem_type: vertex.elem_type,
              executable: vertex.executable,
              break_point: vertex.break_point,
              procedure_section_id: vertex.procedure_section_id,
              procedure_modification_status: vertex.procedure_modification_status,
              procedure_modification: vertex.procedure_modification
            },
            e: edge
          }
        `,
        {},
        {count: true}
      );
    } else {
      cursor = await db.query(
        `
        FOR vertex, edge
          IN 0..10000
          OUTBOUND '${root_idd}'
          GRAPH '${var_dict.graph_name}'
          OPTIONS {bfs: true}
          RETURN {v: vertex, e: edge}
        `,
        {},
        {count: true}
      );
    }

    res = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get elements graph from DB: ' + get_sj_error_message(err));
  }

  if (res.length > 0) {
    root_node = res[0].v;
  } else {
    return Promise.reject(`execution was not found: ${root_idd}`);
  }

  for (let entry of res) {
    let vertex = entry.hasOwnProperty('v') ? entry.v : null;
    let edge = entry.hasOwnProperty('e') ? entry.e : null;

    if (vertex) {
      dict[vertex._id] = vertex;              
    }

    if (edge && vertex) {
      if (edge._id.startsWith(var_dict.step_order_prefix)) {
        let parent = dict[edge._from];
        if (!parent.hasOwnProperty('children')) {
          parent.children = [];
        }

        if (parent._id.startsWith('execution/') || parent._id.startsWith('procedureVersion/')) {
          vertex.parent_id = '';
        } else {
          vertex.parent_id = parent._key;
        }

        vertex.idx = edge['idx'];
        parent.children.push(vertex);
      } else if (edge._id.startsWith(var_dict.run_record_prefix)) {
        let step = dict[edge._from];
        if (!step.hasOwnProperty('run_records')) {
          step.run_records = [];
        }
        vertex.idx = edge['idx'];
        step.run_records.push(vertex);
      }
    }
  }
  
  // set parent_id of root_node if struture is for an element, not the entire procedure or execution
  if (!root_node.parent_idd) {
    if (root_idd.startsWith('execution/') || root_idd.startsWith('procedureVersion/')) {
      // do nothing
    } else {
      // set parent_idd, which will be converted to parent_id by sanitizeElement() below.
      root_node.parent_idd = await getParentIdd(root_idd, var_dict);
    }    
  }

  sortChildren(root_node);  
  
  sanitizeElement(root_node);

  return Promise.resolve(root_node);
}

/**
 * Get conversations status of elements
 * 
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} root_idd - id of execution or element including collection name.
 *                            For example, 'execution/id-123' or 'element/id-432'
*/
var getConversationStatuses = async function (root_type, root_idd) {
  let var_dict = get_root_specific_variables(root_type);

  let cursor = null;
  let res = null;
  let elems = [];

  try {
    cursor = await db.query(
      `
      FOR vertex, edge
        IN 0..10000
        OUTBOUND '${root_idd}'
        GRAPH '${var_dict.graph_name}'
        OPTIONS {bfs: true}
        FILTER !CONTAINS(edge._id, '${var_dict.run_record_prefix}')
        RETURN {
          elem_id: vertex.elem_id,
          conversations: vertex.conversations
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
    for (const r of res) {
      if (r.elem_id && r.conversations && (r.conversations.length > 0)) {
        elems.push({
          elem_id: r.elem_id,
          conversations: r.conversations.map(conversation => {
            return {
              'type': conversation.type, 
              'status': conversation.status
            };
          })
        });
      }
    }
  }

  return Promise.resolve(elems);
}

/**
 * Get a list of parents of an element
 * 
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} root_idd - id of element including collection name.
 *                            For example, 'procedureElement/id-123' or 'element/id-432'
*/
var getParentElements = async function (root_type, root_idd) {
  let var_dict = get_root_specific_variables(root_type);
  
  var this_node = null;

  let cursor = null;
  let res = null;
  const parent_elems = [];

  try {
    cursor = await db.query(
      `
      FOR vertex, edge
        IN 0..10000
        INBOUND '${root_idd}'
        GRAPH '${var_dict.graph_name}'
        OPTIONS {bfs: true}
        RETURN {v: vertex, e: edge}
      `,
      {},
      {count: true}
    );
    res = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get elements graph from DB: ' + get_sj_error_message(err));
  }


  log.trace(`res.length: ${res.length}`);

  if (res.length > 0) {
    this_node = res[0].v;
  } else {
    return Promise.reject(`execution was not found: ${root_idd}`);
  }

  for (let entry of res) {
    let vertex = entry.hasOwnProperty('v') ? entry.v : null;

    if (vertex && vertex.elem_type) {
      if (vertex._id !== this_node._id) {
        parent_elems.push(sanitizeElement(vertex));
      }         
    }
  }

  return Promise.resolve(parent_elems);
}

/**
 * Get elements of execution or procedure.
 * 
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} root_idd - id of execution or element including collection name.
 *                            For example, 'execution/id-123' or 'element/id-432'
 * @param {String} elem_type - elem type filter
 * @param {String} step_type - step type filter
 * @param {String} description - description filter
 * @param {Boolean} all_elements - include all elements regardless of comments
 * @param {Boolean} comment_filter - include elements with general comments
 * @param {Boolean} ar_comment_filter - include elements with activity report comments
 * @param {Boolean} dr_comment_filter - include elements with data review report comments
*/
var getElements = async function (root_type, root_idd, elem_type, step_type, description, 
  all_elements=false, comment_filter=false, ar_comment_filter=false, dr_comment_filter=false) { 
  const root_node = await getStructure(root_type, root_idd, false);

  let elems = [];
  collectElementList(root_node, elem_type, step_type, description, 
    all_elements, comment_filter, ar_comment_filter, dr_comment_filter, elems);
  
  for (let i=0; i < elems.length; i++) {
    sanitize_internal_attrs_recursive(elems[i]);
  }

  return Promise.resolve(elems);
}

/**
 * Get elements with a few key fields
 * 
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} root_idd - id of execution or element including collection name.
 *                            For example, 'execution/id-123' or 'element/id-432'
*/
var getSimpleElements = async function (root_type, root_idd) { 
  const root_node = await getStructure(root_type, root_idd, true);

  if (!root_node.elem_type) {
    // sanitize execution info
    delete root_node.elem_type;
    delete root_node.elem_id;
  }

  let elems = [];
  collectElementList(root_node, null, null, null, 
    null, null, null, null, elems);

  for (let i=0; i < elems.length; i++) {
    sanitize_internal_attrs_recursive(elems[i]);
  }

  return Promise.resolve(elems);
}

/**
 * Get execution status of steps
 * 
 * @param {String} root_idd - id of execution or element including collection name.
 *                            For example, 'execution/id-123' or 'element/id-432'
*/
var getStepStatuses = async function (root_idd) {
  let var_dict = get_root_specific_variables('EXECUTION');
  let cursor = null;
  let res = null;

  try {
    cursor = await db.query(
      `
      FOR vertex, edge
        IN 0..10000
        OUTBOUND '${root_idd}'
        GRAPH '${var_dict.graph_name}'
        OPTIONS {bfs: true}
        FILTER vertex.elem_type == 'STEP'
        FILTER !CONTAINS(edge._id, '${var_dict.run_record_prefix}')
        RETURN {
          elem_id: vertex.elem_id,
          elem_type: vertex.elem_type,
          executed: vertex.executed,
          status: vertex.execution.meta_data.status
        }
      `,
      {},
      {count: true},
    );
    res = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get elements graph from DB: ' + get_sj_error_message(err));
  }

  return Promise.resolve(res);
}

/**
 * Get elements of execution or procedure.
 * 
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {Array} elems_input array of elements to be updated
 * @return {Array} array of elements updated

*/
var updateElements = async function(root_type, elems_input) {
  let var_dict = get_root_specific_variables(root_type);
  let element_collection = var_dict.element_collection;

  elems_input.forEach(function (elem_input) {
    elem_input['_key'] = elem_input.elem_id;
  });

  let elems = [];
  if (elems_input.length > 0) {
    let items = null;
    try {
      items = await element_collection.updateAll(elems_input, {returnNew: true});
    } catch (err) {
      return Promise.reject('Failed to update elements in DB: ' + get_sj_error_message(err));
    }

    elems = items.map(function(item) {return item.new})
  }

  elems.forEach(function(elem) {
    sanitize_internal_attrs(elem);
  });

  return Promise.resolve(elems);
}

/**
 * Get the ordered list of elem_id's and element parent_id's of an execution or a procedure version 
 * 
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} root_idd - id of execution or element including collection name.
 *                            For example, 'execution/id-123' or 'procedureVersion/id-765'
*/
var getElementIds = async function (root_type, root_idd) {
  let var_dict = get_root_specific_variables(root_type);
  
  var root_node = null;
  var dict = {};
  let cursor = null;
  let res = null;

  log.trace(`getElementIds root_idd: ${root_idd}`);

  try {
    cursor = await db.query(
      `
      FOR vertex, edge
        IN 0..10000
        OUTBOUND '${root_idd}'
        GRAPH '${var_dict.graph_name}'
        OPTIONS {bfs: true}
        RETURN {v: vertex, e: edge}
      `,
      {},
      {count: true}
    );
    res = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get elements graph from DB: ' + get_sj_error_message(err));
  }

  log.trace(`res.length: ${res.length}`);
  if (res.length > 0) {
    root_node = res[0].v;
  }

  for (let entry of res) {
    let vertex = entry.hasOwnProperty('v') ? entry.v : null;
    let edge = entry.hasOwnProperty('e') ? entry.e : null;

    // check only for vertex. Since edge will be null for the start of the graph
    if (vertex != null) {
      dict[vertex._id] = vertex;              
    }

    // vertex or edge can be null if the vertex has been already deleted.
    // for example if multiple calls of deleteElement are under way
    // asynchronously.            
    if (vertex != null && edge != null) {
      if (edge._id.startsWith(var_dict.step_order_prefix)) {
        let parent = dict[edge._from];
        if (!parent.hasOwnProperty('children')) {
          parent.children = [];
        }

        if (parent._id.startsWith('execution/') || parent._id.startsWith('procedureVersion/')) {
          vertex.parent_id = '';
        } else {
          vertex.parent_id = parent._key;
        }

        vertex.idx = edge['idx'];
        parent.children.push(vertex);
      }
    }
  }

  sortChildren(root_node);

  let elem_ids = [];
  let parent_ids = [];
  collectElementIds(root_node, elem_ids, parent_ids);

  return Promise.resolve({elem_ids, parent_ids});
}

function collectElementList(parent_elem, elem_type, step_type, description, 
  all_elements, comment_filter, ar_comment_filter, dr_comment_filter, elems) {
    
  let is_element = parent_elem.hasOwnProperty('elem_type');
  let exclude = false;  
  let children = null;

  if (is_element) {
    if (elem_type !== null) {
      if (elem_type != parent_elem.elem_type) {
        exclude = true;
      }
    }

    if (step_type !== null) {
      if (parent_elem.elem_type != 'STEP') {
        exclude = true;
      } else {
        if (step_type != parent_elem.step_type) {
          exclude = true;
        }
      }
    }

    if (description !== null) {
      if (parent_elem.description.toLowerCase().indexOf(description.toLowerCase())==-1) {
        exclude = true;
      }
    }
    
    if (!all_elements && (comment_filter || ar_comment_filter || dr_comment_filter)) {
      let has_comment = false;
      let has_ar_comment = false;
      let has_dr_comment = false;

      if (parent_elem.conversations) {
        parent_elem.conversations.forEach(conversation => {
          if (conversation.type === 'COMMENT') {
            has_comment = true;
          } else if (conversation.type === 'ACTIVITY_REPORT_COMMENT') {
            has_ar_comment = true;
          } else if (conversation.type === 'DATA_REVIEW_COMMENT') {
            has_dr_comment = true;
          }
        });
        
        if ((comment_filter && has_comment) || 
          (ar_comment_filter && has_ar_comment) || 
          (dr_comment_filter && has_dr_comment)) {
          // do nothing
        } else {
          exclude = true;
        }
      }
    }
  }

  if (parent_elem.hasOwnProperty('children')) {
    children = parent_elem.children;
    delete parent_elem.children;
  }

  if (is_element && (!exclude)) {
    elems.push(parent_elem);  
  }

  if (children != null) {
    let length = children.length;
    for (let i=0; i < length; i++) {
      collectElementList(children[i], elem_type, step_type, description, 
        all_elements, comment_filter, ar_comment_filter, dr_comment_filter, elems);
    }    
  }
}

/**
 * Get the elements and stepOrder edges of the root element and all its children
 * 
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} root_idd - id of execution or element including collection name.
 *                            For example, 'execution/id-123' or 'element/id-432'
 *                             
*/
var getElementsAndEdges = async function (root_type, root_idd) {
  let var_dict = get_root_specific_variables(root_type);
  let cursor = null;
  let res = null;

  try {
    cursor = await db.query(
      `
      FOR vertex, edge
        IN 0..10000
        OUTBOUND '${root_idd}'
        GRAPH '${var_dict.graph_name}'
        OPTIONS {bfs: true}
        RETURN {v: vertex, e: edge}
      `,
      {},
      {count: true}
    );
    res = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get elements graph from DB: ' + get_sj_error_message(err));
  }

  // map from _id to elem
  let elem_dict = {};
  // map from _id to edge 
  let step_order_edge_dict = {};

  let elems = [];
  let step_order_edges = [];

  for (let entry of res) {
    let vertex = entry.hasOwnProperty('v') ? entry.v : null;
    let edge = entry.hasOwnProperty('e') ? entry.e : null;

    if (vertex !== null) {
      if (vertex._id.startsWith(var_dict.element_prefix)) {
        if (elem_dict[vertex._id]) {
          log.warning(`Element has been already included in the copy. idd: ${vertex._id}`);
        } else {
          elem_dict[vertex._id] = vertex;
          elems.push(vertex);
        }                
      }
    }
    
    if (edge !== null) {
      if (edge._id.startsWith(var_dict.step_order_prefix)) {
        if (step_order_edge_dict[edge._id]) {
          log.warning(`Edge has been already included in the copy. idd: ${edge._id}`);
        } else {
          step_order_edge_dict[edge._id] = edge;
          step_order_edges.push(edge);
        }                
      }
    }            
  }
  
  return Promise.resolve({'elems': elems, 'step_order_edges': step_order_edges});
}


/**
 * Get the content of the element
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} elem_id - unique id of element (section, step, or paragraph)
 * @return {Promise}
*/
var getElement = async function(root_type, elem_id) {
  let var_dict = get_root_specific_variables(root_type);
  let docs = null;
  try {
    docs = await var_dict.element_collection.lookupByKeys([elem_id]);
  } catch (err) {
    return Promise.reject('Failed to get element from DB: ' + get_sj_error_message(err));
  }

  if (docs.length > 1) {
    log.warning(`More than one element was found for elem_id: ${elem_id}`);
  }

  if (docs.length == 0) {
    let msg = `No element was found for elem_id: ${elem_id}`;
    log.warning(msg);
    return Promise.reject(msg);
  } else {
    let elem = docs[0];
    // sanitize parent_id for ING-4325
    if (elem.hasOwnProperty('parent_id')) {
      delete elem.parent_id;
    }
    return Promise.resolve(elem);
  }
}

/**
 * Get the content of the element without internal db attributes
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} elem_id - unique id of element (section, step, or paragraph)
 * @return {Promise}
*/ 
var getElementSanitized = async function(root_type, elem_id) {
  const elem = await getElement(root_type, elem_id);
  return Promise.resolve(sanitize_internal_attrs(elem));
}

/**
 * Delete an element from execution
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} elem_id - id of the element to delete
 * @param {String} check_redline - create redline instead of deleting the element
 * @return {Promise} promise that will be fulfilled with the
 * list of elements whose numbers were changed.
 */
var deleteElement = async function(root_type, elem_id, check_redline) {
  let var_dict = get_root_specific_variables(root_type);

  let root_idd = null;
  
  let elem_idd = var_dict.element_prefix + elem_id;
  let elem = null;

  let target_parent_id = null;   // db key of the parent element
  let target_parent_idd = null;  // db id of the parent element
  let target_parent = null;  
  let idx = 0;            // idx of the element to delete

  let elem_dict = {};
  let edge_dict = {};    // dict from elem_idd to edge


  let elems_to_update = [];
  let edges_to_update = {};
  let updated_numbers = [];

  let elems_to_delete = [];
  let edges_to_delete = [];

  let cursor = null;
  let edges = null;
  let res = null;

  const elem_to_delete = await getElement(root_type, elem_id);
  root_idd = '{0}{1}'.format(var_dict.root_prefix, elem_to_delete[var_dict.root_key_name]);

  // To create DELETED redline
  if (check_redline 
      && elem_to_delete['run_for_score'] 
      && (elem_to_delete['procedure_modification_status'] == definitions.PMS.ORIGINAL) 
      && (elem_to_delete['elem_type'] !== 'SECTION')) {
    // create a redline
    const procedure_modification = getProcedureModificationTemplate();
    await updateElement(root_type, elem_id, 
      {
        'procedure_modification_status': definitions.PMS.DELETED,
        'procedure_modification': procedure_modification
    });
    const {elem_ids, parent_ids} = await getElementIds(root_type, root_idd);

    updated_numbers.push({
      'elem_id': elem_id, 
      'number': elem_to_delete['number'], 
      'procedure_modification_status': definitions.PMS.DELETED,
      'procedure_modification': procedure_modification
    });
    return Promise.resolve({'numbers': updated_numbers, 'elem_ids': elem_ids});
  }

  try {
    cursor = await var_dict.step_order_collection.byExample({'_to': elem_idd});
    edges = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get parent edge from DB: ' + get_sj_error_message(err));
  }

  if (edges.length == 0) {
    let msg = 'No parent was found for elem_id: {0}'.format(elem_id);
    log.error(msg);
    return Promise.reject(msg);
  } else {
    target_parent_id = edges[0]._from.split('/')[1];
    target_parent_idd = edges[0]._from;
  }

  try {
    cursor = await db.query(
      `
      FOR vertex, edge
        IN 0..10000
        OUTBOUND '${target_parent_idd}'
        GRAPH '${var_dict.graph_name}'
        OPTIONS {bfs: true}
        RETURN {v: vertex, e: edge}
      `,
      {},
      {count: true}
    );
    res = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get elements graph from DB: ' + get_sj_error_message(err));
  }

  if (res.length > 0) {
    target_parent = res[0].v;
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
    
    if (vertex && edge) {
      if (edge._id.startsWith(var_dict.step_order_prefix)) {
        let parent = elem_dict[edge._from];
        
        if (parent === undefined) {
          // this can happen if a sibling element is being deleted at the same time 
          log.warning(`Parent not found when deleting an element. edge._from: ${edge._from}`);
        } else {
          if (!parent.hasOwnProperty('children')) {
            parent.children = [];
          }
          vertex.idx = edge['idx'];
          parent.children.push(vertex);                      
        }
      } else if (edge._id.startsWith(var_dict.run_record_prefix)) {
        let parent = elem_dict[edge._from];
        if (!parent.hasOwnProperty('results')) {
          parent.results = [];
        }
        parent.results.push(vertex);
      }
    }
  }

  if (elem_dict.hasOwnProperty(elem_idd)) {
    elem = elem_dict[elem_idd];
    idx = elem.idx;
  } else {
    return Promise.reject('element was not found: {0}'.format(insert_after_id));
  }
  
  // sort

  sortChildren(target_parent);

  // update idx for the current siblings
  target_parent = elem_dict[target_parent_idd];

  // this may happen for execution
  if (!target_parent.hasOwnProperty('children')) {
    target_parent.children = [];
  }
  
  // delete element from the parent
  // delete
  target_parent.children.splice(idx, 1);
  
  prepare_sibling_edges(target_parent, edge_dict, edges_to_update, null, null);

  delete_vertex(elem, elems_to_delete, edges_to_delete, edge_dict);

  if (elem_to_delete['elem_type'] === 'SECTION') {
    for (let i=0; i < elems_to_delete.length; i++) {
      if (elems_to_delete[i].elem_type !== 'SECTION' && elems_to_delete[i].run_for_score) {
        let msg = `Cannot delete a section that contains run for record element. number: ${elem_to_delete['number']} child number: ${elems_to_delete[i].number}`;
        return Promise.reject(msg);
      }
      if (elems_to_delete[i].elem_type === 'SECTION' && elems_to_delete[i].run_for_score && elems_to_delete[i].procedure_modification_status !== 'ADDED') {
        let msg = `Cannot delete a section that is run for record. number: ${elems_to_delete[i].number}`;
        return Promise.reject(msg);
      }
    }
  }

  for (let i=0; i < elems_to_delete.length; i++) {
    if (elems_to_delete[i].executed && elems_to_delete[i].executable == 'EXECUTED') {
      return Promise.reject('Cannot delete element that has been executed. number: {0}'.format(elems_to_delete[i]['number']));
    }
    if (elems_to_delete[i].imported) {
      return Promise.reject('Cannot delete run procedure step that has been imported. number: {0}'.format(elems_to_delete[i]['number']));
    }                  
  }
  
  if (elem_dict.hasOwnProperty(target_parent_idd)) {
    let parent_number = target_parent.hasOwnProperty('number') ? target_parent['number'] : null;
    //
    update_number(root_type, target_parent, parent_number, idx, elems_to_update, updated_numbers, null);
    sanitizeElement(target_parent);

    // Delete elements
    let element_keys = [];
    let step_order_keys = [];
    let run_record_keys = [];

    for(let elem of elems_to_delete) {
      let id = elem._id;
      if (id.startsWith(var_dict.element_prefix)) {
        element_keys.push(id.split('/')[1]);
      }
    }
    for(let edge of edges_to_delete) {
      let id = edge._id;
      if (id.startsWith(var_dict.step_order_prefix)) {
        step_order_keys.push(id.split('/')[1]);
      } else if (id.startsWith(var_dict.run_record_prefix)) {
        run_record_keys.push(id.split('/')[1]);
      }
    }

    try {
      if (element_keys.length > 0) {
        await var_dict.element_collection.removeByKeys(element_keys);
      }
      if (step_order_keys.length > 0) {
        await var_dict.step_order_collection.removeByKeys(step_order_keys);
      }
      if (run_record_keys.length > 0 && var_dict.run_record_collection) {
        await var_dict.run_record_collection.removeByKeys(run_record_keys);
      }
      if (elems_to_update.length > 0) {
        await var_dict.element_collection.updateAll(elems_to_update);
      }
      if (Object.keys(edges_to_update).length > 0) {
        await var_dict.step_order_collection.updateAll(Object.values(edges_to_update));
      }
    } catch (err) {
      return Promise.reject('Failed to update database for deletion from DB: ' + get_sj_error_message(err));
    }

    const {elem_ids, parent_ids} = await getElementIds(root_type, root_idd);

    return Promise.resolve({'numbers': updated_numbers, 'elem_ids': elem_ids});
  } else {
    return Promise.reject('Element is not found: {0}'.format(target_parent_idd));
  }
}

/**
 * Update content of an element.
 * This will merge the current content with the content of elem_in.
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} elem_id - id of the target element
 * @param {Object} elem_in - content of the element
*/
var updateElement = async function(root_type, elem_id, elem_in) {
  let var_dict = get_root_specific_variables(root_type);
  
  // calling this to check existence of the element
  const elem = await getElement(root_type, elem_id);

  try {
    const res = await var_dict.element_collection.update(elem_id, elem_in, { returnNew: true });
    if (res.hasOwnProperty('new')) {
      // sanitize parent_id for ING-4325
      if (res.new.hasOwnProperty('parent_id')) {
        delete res.new.parent_id;
      }

      return sanitize_internal_attrs(res.new);
    } else {
      return Promise.reject('Failed to update element in DB. Updated element was not returned');
    }
    
  } catch (err) {
    return Promise.reject('Failed to update element in DB: ' + get_sj_error_message(err));
  }
}

/**
 * get file info of an element
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} elem_id - Unique id of element
 * @param {String} comment_id - Unique id of comment
 * @return {Promise} - A promise that may be fulfilled with a comment
 */
var getFile = async function(root_type, elem_id, file_id) {
  const elem = await getElement(root_type, elem_id);

  let idx = -1;
  let files = null;
  if (elem.hasOwnProperty('files')) {
    files = elem['files'];
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


var getCommentFile = async function(root_type, root_id, elem_id, conversation_id, comment_id, file_id) {
  const comment = await getComment(root_type, root_id, elem_id, conversation_id, comment_id);

  let idx = -1;
  let files = null;
  if (comment.hasOwnProperty('files')) {
    files = comment['files'];
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
 * get comments of an element
 *
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @return {Promise} - A promise that may be fulfilled with an array of comments
 */
var getComments = async function(root_type, root_id, elem_id, conversation_id, offset, limit) {
  const elem = await getElement(root_type, elem_id);
  const {conversations, conversation_index, conversation} = get_element_conversation(elem, conversation_id);

  let comments = [];
  if (conversation.hasOwnProperty('comments')) {
    comments = conversation['comments'];
  }

  let response = {'total' : comments.length}
  if(offset) {
    comments = comments.slice(offset);
  }

  if(limit) {
    comments = comments.slice(0,limit);
  }

  response['comments'] = comments;
  return Promise.resolve(response);
}


/**
 * add a comment
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} execution_id - unique id of execution
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation 
 * @param {String} input_comment - New comment
 * @param {String} user_name - user name
 * @return {Promise} - Promise that may be fulfilled with the comment
 */
var addComment = async function(root_type, root_id, elem_id, conversation_id, input_comment, user_name) {
  let var_dict = get_root_specific_variables(root_type);
  
  // defaults that may be overridden by input_comment
  let comment_def = create_empty_comment(user_name);
  let comment = extend(true, {}, comment_def, input_comment);

  const elem = await getElement(root_type, elem_id);
    
  const {conversations, conversation_index, conversation} = get_element_conversation(elem, conversation_id);

  let comments = ensure_element_comments(elem, conversation_id);

  comments.push(comment);

  try {
    await var_dict.element_collection.update(elem_id, {'conversations': conversations});
  } catch (err) {
    return Promise.reject('Failed to update element: ' + get_sj_error_message(err));
  }

  return Promise.resolve(comment);
}

/**
 * get a comment of an element
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} root_id - Unique id of root (execution or procedure version)
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @param {String} comment_id - Unique id of comment
 * @return {Promise} - A promise that may be fulfilled with a comment
 */
var getComment = async function(root_type, root_id, elem_id, conversation_id, comment_id) {
  const elem = await getElement(root_type, elem_id);
  const {conversations, converstation_index, conversation, comments, comment_index, comment} = 
    get_element_comment(elem, conversation_id, comment_id);

  return Promise.resolve(comment);
}

/**
 * update a comment of an element
 * @param {String} root_type - EXECUTION or PROCEDURE (for this it should be always EXECUTION)
 * @param {String} root_id - Unique id of execution
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @param {String} comment_id - Unique id of comment
 * @param {CommentInput} comment_input - comment input
 * @param {String} user_name - user name 
 * @return {Promise} - A promise that may be fulfilled with a comment
 */
var updateComment = async function(root_type, root_id, elem_id, conversation_id, comment_id, comment_input, user_name) {
  const elem = await getElement(root_type, elem_id);
  
  const {conversations, converstation_index, conversation, comments, comment_index, comment} = 
    get_element_comment(elem, conversation_id, comment_id);
  
  comment_input['user_name'] = user_name;
  comment_input['time_updated'] = new Date();
  
  // update comment object
  extend(true, comment, comment_input);

  await updateElement(root_type, elem_id, {'conversations': conversations});
  return Promise.resolve(comment);
}

/**
 * delete a comment
 *
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @param {String} comment_id - Unique id of comment
 * @return {Promise}
 */
var deleteComment = async function(root_type, root_id, elem_id, conversation_id, comment_id) {
  let var_dict = get_root_specific_variables(root_type);

  const elem = await getElement(root_type, elem_id);
  const {conversations, converstation_index, conversation, comments, comment_index, comment} = 
    get_element_comment(elem, conversation_id, comment_id);

  comments.splice(comment_index, 1);

  try {
    await var_dict.element_collection.update(elem_id, {'conversations': conversations});
  } catch (err) {
    return Promise.reject('Failed to update element in DB: ' + get_sj_error_message(err));
  }
  return Promise.resolve(comment);
}

/**
 * get files of an element
 *
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} elem_id - Unique id of element
 * @return {Promise} - A promise that may be fulfilled with an array of comments
 */
var getFiles = async function(root_type, elem_id, offset, limit) {
  const elem = await getElement(root_type, elem_id);

  let files = [];
  if (elem.hasOwnProperty('files')) {
    files = elem['files'];
  }

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

var getCommentFiles = async function(root_type, root_id, elem_id, conversation_id, comment_id, offset, limit) {
  const comment = await getComment(root_type, root_id, elem_id, conversation_id, comment_id);

  let files = [];
  if (comment.hasOwnProperty('files')) {
    files = comment['files'];
  }

  let response = {'total' : files.length};
  if(offset) {
    files = files.slice(offset);
  }

  if(limit) {
    files = files.slice(0,limit);
  }

  response['files'] = files;
  return Promise.resolve(response);
}


/**
 * delete a file
 *
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} elem_id - Unique id of element
 * @param {String} comment_id - Unique id of comment
 * @return {Promise}
 */
var deleteFile = async function(root_type, elem_id, file_id) {
  let var_dict = get_root_specific_variables(root_type);

  const elem = await getElement(root_type, elem_id);

  let idx = -1;
  let files = null;
  if (elem.hasOwnProperty('files')) {
    files = elem['files'];
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
  let fileToDelete = files[idx];
  files.splice(idx, 1);

  try {
    await var_dict.element_collection.update(elem_id, {'files': files});
  } catch (err) {
    return Promise.reject('Failed to update element in DB: ' + get_sj_error_message(err));
  }

  return Promise.resolve(fileToDelete);
}


var deleteCommentFile = async function(root_type, root_id, elem_id, conversation_id, comment_id, file_id) {
  let var_dict = get_root_specific_variables(root_type);
  const elem = await getElement(root_type, elem_id);
  
  const {conversations, converstation_index, conversation, comments, comment_index, comment} = 
    get_element_comment(elem, conversation_id, comment_id);

  let idx = -1;
  let files = null;
  if (comment.hasOwnProperty('files')) {
    files = comment['files'];
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
  let fileToDelete = files[idx];
  files.splice(idx, 1);
  comments[comment_index]['files'] = files;

  try {
    await var_dict.element_collection.update(elem_id, {'conversations' : conversations});
  } catch (err) {
    return Promise.reject('Failed to update element: ' + get_sj_error_message(err));
  }
  return Promise.resolve(fileToDelete);
}

/**
 * add a conversation
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} execution_id - unique id of execution
 * @param {String} elem_id - Unique id of element
 * @param {String} input_conversation - New comment
 * @param {String} user_name - user name
 * @return {Promise} - Promise that may be fulfilled with the comment
 */
var addConversation = async function(root_type, root_id, elem_id, input_conversation, user_name) {
  let var_dict = get_root_specific_variables(root_type);
  
  let conversation_id = uuid.v4();
  // defaults that may be overridden by input_conversation
  let conversation_def = {
    'type': 'COMMENT',
    'status': definitions.CommentStatus.UNRESOLVED,
    'comments': [create_empty_comment(user_name)]
  }

  input_conversation['conversation_id'] = conversation_id;
  input_conversation['time_resolved'] = '';
  input_conversation['resolved_by'] = '';

  let conversation = extend(true, {}, conversation_def, input_conversation);

  const elem = await getElement(root_type, elem_id);
  
  let conversations = ensure_element_conversations(elem);

  conversations.push(conversation);

  try {
    await var_dict.element_collection.update(elem_id, {'conversations': conversations});
  } catch (err) {
    return Promise.reject('Failed to update element: ' + get_sj_error_message(err));
  }

  return Promise.resolve(conversation);
}

/**
 * get conversations of an element
 *
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} elem_id - Unique id of element
 * @return {Promise} - A promise that may be fulfilled with an array of conversations
 */
var getConversations = async function(root_type, root_id, elem_id, offset, limit) {
  const elem = await getElement(root_type, elem_id);
  const conversations = ensure_element_conversations(elem);

  let response = {'total' : conversations.length}
  if(offset) {
    conversations = conversations.slice(offset);
  }

  if(limit) {
    conversations = conversations.slice(0,limit);
  }

  response['conversations'] = conversations;
  return Promise.resolve(response);
}


/**
 * get a conversation of an element
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} root_id - Unique id of root (execution or procedure version)
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @return {Promise} - A promise that may be fulfilled with a comment
 */
var getConversation = async function(root_type, root_id, elem_id, conversation_id) {
  const elem = await getElement(root_type, elem_id);
  const {conversations, converstation_index, conversation} = 
    get_element_conversation(elem, conversation_id);

  return Promise.resolve(conversation);
}

/**
 * update conversation of an element
 * @param {String} root_type - EXECUTION or PROCEDURE (for this it should be always EXECUTION)
 * @param {String} root_id - Unique id of execution
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @param {ConversationInput} conversation_input - comment input
 * @param {String} user_name - user name 
 * @return {Promise} - A promise that may be fulfilled with a comment
 */
var updateConversation = async function(root_type, root_id, elem_id, conversation_id, conversation_input, user_name) {
  const elem = await getElement(root_type, elem_id);
  
  const {conversations, converstation_index, conversation} = 
    get_element_conversation(elem, conversation_id);
  
  if (conversation_input.hasOwnProperty('status')) {
    if (conversation_input['status'] == 'RESOLVED') {
      conversation_input['resolved_by'] = user_name;
      conversation_input['time_resolved'] = new Date();      
    } else if (conversation_input['status'] == 'UNRESOLVED') {
      conversation_input['resolved_by'] = '';
      conversation_input['time_resolved'] = '';        
    }
  }

  // update conversation object
  extend(true, conversation, conversation_input);

  await updateElement(root_type, elem_id, {'conversations': conversations});
  return Promise.resolve(conversation);
}

/**
 * delete a conversation
 *
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} elem_id - Unique id of element
 * @param {String} conversation_id - Unique id of conversation
 * @return {Promise}
 */
var deleteConversation = async function(root_type, root_id, elem_id, conversation_id) {
  let var_dict = get_root_specific_variables(root_type);

  const elem = await getElement(root_type, elem_id);
  const {conversations, converstation_index, conversation} = 
    get_element_conversation(elem, conversation_id);

    conversations.splice(converstation_index, 1);

  try {
    await var_dict.element_collection.update(elem_id, {'conversations': conversations});
  } catch (err) {
    return Promise.reject('Failed to update element in DB: ' + get_sj_error_message(err));
  }
  return Promise.resolve(conversation);
}

var create_empty_comment = function(user_name) {
  const comment_id = uuid.v4();
  // defaults that may be overridden by input_comment
  const comment = {
    'comment_id': comment_id,
    'user_name': user_name,
    'time_updated': new Date(),
    'content': '',
    'files': []
  }
  return comment;
}

/**
 * add file_info
 *
 * @param {String} root_type - EXECUTION or PROCEDURE
 * @param {String} elem_id - Unique id of element
 * @param {String} input_comment - New comment
 * @return {Promise} - Promise that may be fulfilled with the comment
 */
var addFile = async function(root_type, elem_id, input_file) {
  let var_dict = get_root_specific_variables(root_type);
  
  let file_id = uuid.v4();
  let file_info_def = {
    'file_id': file_id,
    'file_name': '',
    'url': ''
  }

  let file_info = extend(true, {}, file_info_def, input_file);

  const elem = await getElement(root_type, elem_id);

  let files = elem.hasOwnProperty('files') ? elem['files'] : [];

  files.push(file_info);

  try {
    await var_dict.element_collection.update(elem_id, {'files': files});
  } catch (err) {
    return Promise.reject('Failed to update element: ' + get_sj_error_message(err));
  }
  return Promise.resolve(file_info);
}

var addFileComment = async function(root_type, root_id, elem_id, conversation_id, comment_id, input_file) {
  let var_dict = get_root_specific_variables(root_type);
  
  let file_id = uuid.v4();
  let file_info_def = {
    'file_id': file_id,
    'file_name': '',
    'url': ''
  }

  let file_info = extend(true, {}, file_info_def, input_file);

  const elem = await getElement(root_type, elem_id);
  const {conversations, converstation_index, conversation, comments, comment_index, comment} = 
    get_element_comment(elem, conversation_id, comment_id);
    
  let files = comment.hasOwnProperty('files') ? comment['files'] : [];
  files.push(file_info);
  comment['files'] = files;

  try {
    await var_dict.element_collection.update(elem_id, {'conversations': conversations});
  } catch (err) {
    return Promise.reject('Failed to update element: ' + get_sj_error_message(err));
  }

  return Promise.resolve(file_info);
}


/**
 * collect elements into a list  
 * @param {Object} parent - procedure version or parent element
 * @param {Array} elems - elements (output) 
 */
var collectElements = function(parent, elems) {
  if (parent) {
    if (parent['elem_type']) {
      elems.push(parent);
    }
  
    if (parent['children']) {
      let children = parent['children'];
  
      for (let i=0; i < children.length; i++) {
        let child = children[i];
        collectElements(child, elems);
      }
      delete parent['children'];      
    }
  }  
}

var getProcedureModificationTemplate = function() {
  return {
    'justification': {
      'modification_type': definitions.PMT.REDLINE,      
      'content': '',
      'user_name': '',
      'time_updated': ''
    },
    'approval': {
      'content': '',
      'user_name': '',
      'time_updated': '',
      'status': 'PENDING'
    }
  };
}

var getTargetProcedureSectionId = function(target_parent) {
  let procedure_section_id = '';
  // Determine if the element is added to a procedure section
  if (target_parent['procedure_section_id']) {
    procedure_section_id = target_parent['procedure_section_id'];
  } else if (target_parent['elem_type'] == 'PROCEDURE_SECTION') {
    procedure_section_id = target_parent['elem_id'];
  }

  return procedure_section_id;
}

var getTargetProcedureTitle = function(target_parent) {
  let procedure_title = '';
  // Determine if the element is added to a procedure section
  if (target_parent['procedure_title']) {
    procedure_title = target_parent['procedure_title'];
  } else if (target_parent['elem_type'] == 'PROCEDURE_SECTION') {
    if (target_parent['execution_user_input'] && 
      target_parent['execution_user_input']['reference_procedure_title']) {
      procedure_title = target_parent['execution_user_input']['reference_procedure_title'];
    }
  }

  return procedure_title;
}

var getTargetProcedureId = function(target_parent) {
  let procedure_id = '';
  if (target_parent['procedure_id']) {
    // this works also if target_parent is a procedure version
    procedure_id = target_parent['procedure_id'];
  } else if (target_parent['elem_type'] == 'PROCEDURE_SECTION') {
    if (target_parent['execution_user_input'] && 
      target_parent['execution_user_input']['reference_procedure_id']) {
      procedure_id = target_parent['execution_user_input']['reference_procedure_id'];
    }
  }

  return procedure_id;
}

var getTargetProcedureVersionId = function(target_parent) {
  let version_id = '';
  // For execution, this will use the parent's version_id inside procedure section.
  // That's ok since version_id is not used in execution.
  if (target_parent['version_id']) {
    // this works also if target_parent is a procedure version
    version_id = target_parent['version_id'];
  }

  return version_id;
}

var getTargetExecutionId = function(target_parent) {
  let execution_id = '';
  if (target_parent['execution_id']) {
    // this works also if target_parent is an execution
    execution_id = target_parent['execution_id'];
  }

  return execution_id;
}

var setProcedureMetaData = function(elem, target_parent, recursive) {
  elem['procedure_section_id'] = getTargetProcedureSectionId(target_parent);
  elem['procedure_title'] = getTargetProcedureTitle(target_parent);
  elem['procedure_id'] = getTargetProcedureId(target_parent);
  elem['version_id'] = getTargetProcedureVersionId(target_parent);

  elem['execution_id'] = getTargetExecutionId(target_parent);

  // Do not change procedure meta data for elements inside procedure section
  if (elem['elem_type'] == 'PROCEDURE_SECTION') {
    return;
  }

  if (recursive && elem.children) {
    elem.children.forEach((child) => {
      setProcedureMetaData(child, target_parent, recursive);
    });
  }
}

var resetElemNumber = function(elem, recursive) {
  elem['number'] = '';

  // Do not change number for elements inside procedure section
  if (elem['elem_type'] == 'PROCEDURE_SECTION') {
    return;
  }
  if (recursive && elem.children) {
    elem.children.forEach((child) => {
      resetElemNumber(child, recursive);
    });
  }
}

var setRunForScoreMetaData = function(elem, run_for_score, procedure_modification_status, procedure_modification, recursive) {

  elem['run_for_score'] = run_for_score;
  elem['procedure_modification_status'] = procedure_modification_status;
  elem['procedure_modification'] = procedure_modification;

  // Do not change R4R meta data for elements inside procedure section
  if (elem['elem_type'] == 'PROCEDURE_SECTION') {
    return;
  }

  if (recursive && elem.children) {
    elem.children.forEach((child) => {
      setRunForScoreMetaData(child, run_for_score, procedure_modification_status, procedure_modification, recursive);
    });
  }
}


var isInRunForScore = function(target_parent) {
  let run_for_score = false;
  // If target parent is an execution, it has no elem_id.
  // execution itself is always not run for score.
  if (target_parent.elem_id) {
    if (target_parent['run_for_score']) {
      run_for_score = true
    } else if (target_parent['elem_type'] == 'PROCEDURE_SECTION') {
      if (target_parent['execution_user_input'] && target_parent['execution_user_input']['run_for_score']) {
        run_for_score = true;
      } else {
        run_for_score = false;
      }
    }
  }
  return run_for_score;
}

var isRedlineElement = function(elem) {
  if (elem['procedure_modification_status'] == definitions.PMS.ADDED || 
    elem['procedure_modification_status'] == definitions.PMS.DELETED ||
    elem['procedure_modification_status'] == definitions.PMS.MODIFIED ||
    elem['procedure_modification_status'] == definitions.PMS.MODIFYING ||
    elem['procedure_modification_status'] == definitions.PMS.MODIFYING_OLD)
  {
    return true;
  }

  return false;
}

var getUserName = function(authorization_header) {
  // authorization_header should be in the format of "Bearer encoded_token"
  let username = '';
  if (authorization_header) {
    let decoded = jwt.verify(authorization_header.substring(7), config.public_pem, { algorithms: ['RS256'] });
    if (decoded.hasOwnProperty('username')) {
      username = decoded['username'];
    }
  }

  return username;
}

var removeProcedureSectionChildren = function(elem) {
  if (elem.elem_type == 'PROCEDURE_SECTION') {
    elem.children = [];
  } else {
    if (elem.children) {
      for (let i=0; i < elem.children.length; i++) {
        removeProcedureSectionChildren(elem.children[i]);
      }
    }
  }
}

var sort_element_idds = function(source_elem_idds_map, parent, sorted_idds) {
  if (parent._id && source_elem_idds_map.hasOwnProperty(parent._id)) {
    sorted_idds.push(parent._id);
  }
  if (parent.children) {
    for (const child of parent.children) {
      sort_element_idds(source_elem_idds_map, child, sorted_idds);
    }
  }
}

var prepare_sibling_edges = function(target_parent, edge_dict, edges_to_update, skip_idx, skip_count) {  
  for (let i=0; i < target_parent.children.length; i++) {
    if (skip_idx !== null && skip_count !== null && i >= skip_idx && i < (skip_idx + skip_count)) {
      // This is used to skip the copied element. 
      // Its edge will be added to edges_to_add later by calling prepareElementForCopy()
      continue;
    }
        
    let child = target_parent.children[i];
    
    child.idx = i;
  
    if (edge_dict.hasOwnProperty(child._id)) {      
      let edge = edge_dict[child._id];
      edge['idx'] = child.idx;
      edges_to_update[child._id] = edge;
    } else {
      throw new Error('Edge not found for: {0}'.format(child._id));
    }
  }      
}

var get_target_idx = function(target_parent, insert_after_id, level) {
  let target_idx = 0;
  if (insert_after_id == '-1') {
    // insert at the front of the execution
    target_idx = 0;
  } else {
    if (level == 'CHILD') {
      target_idx = 0;
    } else {
      // SIBLING is default
      for (let i=0; i < target_parent.children.length; i++) {
        let child = target_parent.children[i];
        if (child.elem_id == insert_after_id) {
          target_idx = i + 1;
          break;
        }
      }
      if (target_idx == 0) {
        throw new Error(`insert_after_id was not found: ${insert_after_id}`);
      }
    }
  }  
  return target_idx;
}

var update_idx_for_edges = function(edges) {
  const edgesMap = {};
  for (let edge of edges) {
    if (!edgesMap.hasOwnProperty(edge._from)) {
      edgesMap[edge._from] = []; 
    }
    edgesMap[edge._from].push(edge);
  }
  
  for (let key in edgesMap) {
    const sibling_edges = edgesMap[key];
    sibling_edges.sort((edge1, edge2) => {return edge1.idx > edge2.idx ? 1 : -1});
    
    for (let i=0; i < sibling_edges.length; i++) {
      sibling_edges[i].idx = i;
    }
  }
}

/**
 * copy only attributes that are needed for outline view 
 * @param {Object} parent - procedure version or parent element
 * @param {Array} elems - elements (output) 
 */
var collectOutlineElements = function(parent, elems) {  
  if (parent['elem_type']) {
    let elem_copy = {
      'elem_type': parent['elem_type'],        
      'title': parent['title'],
      'number': parent['number'],
      'elem_id': parent['elem_id'],
      'parent_id': parent['parent_id'],
      'tag_ids': parent['tag_ids'] || []
    }
    elems.push(elem_copy);
  }

  if (parent['children']) {
    let children = parent['children'];

    for (let i=0; i < children.length; i++) {
      let child = children[i];
      collectOutlineElements(child, elems);
    }      
  }
}

var getParentIdd = async function(elem_idd, var_dict) {
  let edges = [];
  try {
    const cursor = await var_dict.step_order_collection.byExample({'_to': elem_idd});
    edges = await cursor.all();
  } catch (err) {
    return Promise.reject('Failed to get parent edge from DB: ' + get_sj_error_message(err));
  }

  if (edges.length == 0) {
    return '';
  } else {
    return edges[0]._from;
  }  
}


module.exports.log = log
module.exports.db = db
module.exports.config = config
module.exports.push_error = push_error
module.exports.get_sj_error_message = get_sj_error_message
module.exports.sanitize_internal_attrs = sanitize_internal_attrs
module.exports.sanitize_internal_attrs_recursive = sanitize_internal_attrs_recursive
module.exports.remove_execution_time_input_fields = remove_execution_time_input_fields
module.exports.init_db = init_db
module.exports.reset_db = reset_db
module.exports.sanitizeElement = sanitizeElement
module.exports.addElement = addElement
module.exports.moveElement = moveElement
module.exports.copyElement = copyElement
module.exports.getVerticesEdges = getVerticesEdges
module.exports.getStructure = getStructure
module.exports.getParentElements = getParentElements
module.exports.sortChildren = sortChildren
module.exports.update_number = update_number
module.exports.getElement = getElement
module.exports.getElementSanitized = getElementSanitized
module.exports.getElements = getElements
module.exports.getSimpleElements = getSimpleElements
module.exports.getStepStatuses = getStepStatuses
module.exports.updateElements = updateElements
module.exports.deleteElement = deleteElement
module.exports.updateElement = updateElement
module.exports.getElementsAndEdges = getElementsAndEdges
module.exports.getConversationStatuses = getConversationStatuses
module.exports.getFile = getFile

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

module.exports.getFiles = getFiles
module.exports.getCommentFile = getCommentFile
module.exports.getCommentFiles = getCommentFiles
module.exports.deleteFile = deleteFile
module.exports.deleteCommentFile = deleteCommentFile
module.exports.addFile = addFile
module.exports.addFileComment = addFileComment
module.exports.get_root_specific_variables = get_root_specific_variables
module.exports.execution_meta_data_template = execution_meta_data_template
module.exports.collectElements = collectElements
module.exports.getElementIds = getElementIds
module.exports.prepareElementForCopy = prepareElementForCopy
module.exports.getProcedureModificationTemplate = getProcedureModificationTemplate
module.exports.delete_vertex = delete_vertex
module.exports.isRedlineElement = isRedlineElement
module.exports.isInRunForScore = isInRunForScore
module.exports.getUserName = getUserName
module.exports.prepare_sibling_edges = prepare_sibling_edges
module.exports.get_target_idx = get_target_idx
module.exports.update_idx_for_edges = update_idx_for_edges
module.exports.collectOutlineElements = collectOutlineElements