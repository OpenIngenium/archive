'use strict';

// ARCHIVE_ING_IMAGE ("Archive Ingenium Image") holds the full image reference of
// this archive service's own container, e.g.
// "myregistry.example.com/ingenium/archive:r13_1_1". The tag after the last
// ':' (e.g. "r13_1_1") is converted to dotted form (e.g. "r13.1.1") and stored as the
// version, which is written into every new execution's `version` field (see
// api/node_funcs.js#createExecution).
module.exports.version = process.env.ARCHIVE_ING_IMAGE ? process.env.ARCHIVE_ING_IMAGE.split(':').pop().split('_').join('.') : '';
module.exports.api_version = 'v5';
module.exports.database_name = 'ingenium';
module.exports.db_url = process.env.ARANGODBURL ? process.env.ARANGODBURL : 'http://localhost:8529';
module.exports.db_password = process.env.ARANGO_ROOT_PASSWORD ? process.env.ARANGO_ROOT_PASSWORD : 'somepassword';
module.exports.db_user = process.env.ARANGO_USER ? process.env.ARANGO_USER : 'root';
module.exports.execution_id_prefix = process.env.EXECUTION_ID_PREFIX ? process.env.EXECUTION_ID_PREFIX : 'clipper-ingenium-';
module.exports.procedure_id_prefix = process.env.PROCEDURE_ID_PREFIX ? process.env.PROCEDURE_ID_PREFIX : 'clipper-procedure-';
module.exports.public_pem = process.env.PUBLIC_PEM || '';

