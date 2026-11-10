'use strict';

var base_funcs = require('../api/base_funcs');
var node_funcs = require('../api/node_funcs');
var log = base_funcs.log;

exports.create_venue = async function(args, res, next) {
  /**
   * Register a venue
   *
   * venue VenueInput Definition of venue
   * returns Venue
   **/
  let venueInput = args['venue']['value'];

  try {
    const data = await node_funcs.createVenue(venueInput);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when creating a venue', err);
    res.status(400).json(err_data);
  }
}

exports.delete_venue = async function(args, res, next) {
  /**
   * Delete a venue (admin only)
   *
   * venue_id String resource id of venue
   * no response value expected for this operation
   **/
  let venue_id = args['venue_id']['value'];

  try {
    const data = await node_funcs.deleteVenue(venue_id);
    res.status(204).end();
  } catch(err) {
    const err_data = base_funcs.push_error('Error when deleting a venue', err);
    res.status(400).json(err_data);
  }
}

exports.get_venue = async function(args, res, next) {
  /**
   * Get venue information
   *
   * venue_id String resource id of venue
   * returns Venue
   **/
  let venue_id = args['venue_id']['value'];

  try {
    const data = await node_funcs.getVenue(venue_id);
    res.status(200).json(base_funcs.sanitize_internal_attrs(data));
  } catch (err) {
    if (err.startsWith('No venue was found:')) {
      res.status(404).json({'message': err})
    } else {
      res.status(400).json({'message': err})
    }
  }
}

exports.get_venue_status = async function(args, res, next) {
  /**
   * Get venue status information
   *
   * venue_id String resource id of venue
   * returns VenueStatus
   **/
  let venue_id = args['venue_id']['value'];
  try {
    const data = await node_funcs.getVenue(venue_id);
    res.status(200).json(data['venue_status']);
  } catch (err) {
    res.status(400).json({'message': err});
  }
}

exports.get_venues = async function(args, res, next) {
  /**
   * Get list of venues. List is sorted by name by default.
   *
   * offset Integer Start index for pagination. zero based. (optional)
   * limit Integer Max number of elements to return. (optional)
   * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
   * status String Filter on venue status * `AVAILABLE` * `IN_USE` * `DOWN` * `UNKNOWN` * `RETIRED`  (optional)
   * exclude_status String Exclude venues of a given status * `AVAILABLE` * `IN_USE` * `DOWN` * `UNKNOWN` * `RETIRED`  (optional)
   * description String Query for words in description (optional)
   * venue_type String filter based on venue type (optional)
   * venue_name String filter based on venue name (optional)
   * venue_group_name String filter based on venue group name. Exact match. (optional)
   * venue_group_status String filter based on venue group status. Exact match.(optional)
   * returns List
   **/
  let offset = args['offset']['value'] || 0;
  let limit = args['limit']['value'] || 10;
  let sort = args['sort']['value'] || 'ASC';
  let status = args['status']['value'] || null;
  let exclude_status = args['exclude_status']['value'] || null;
  let description = args['description']['value'] || null;
  let venue_type = args['venue_type']['value'] || null;
  let venue_name = args['venue_name']['value'] || null;
  let venue_group_name = args['venue_group_name']['value'] || null;
  let venue_group_status = args['venue_group_status']['value'] || null;

  try {
    const data = await node_funcs.getVenues(offset, limit, sort, status, exclude_status, description, venue_type, venue_name, venue_group_name, venue_group_status);
    res.status(200)
    .set('x-total-count', data['total_count'])
    .json(data['venues']);    
  } catch (err) {
    res.status(400).json({'message': err});
  }
}

exports.set_venue_status = async function(args, res, next) {
  /**
   * Update the status of venue
   *
   * venue_id String resource id of venue
   * venue_status VenueStatus Status of venue
   * no response value expected for this operation
   **/
  let venue_id = args['venue_id']['value'];
  let venue_status = args['venue_status']['value'];

  try {
    const data = await node_funcs.updateVenueStatus(venue_id, venue_status);
    res.status(204).end();
  } catch (err_obj) {
    res.status(err_obj['error_code']).json({'message': err_obj['message']});
  }
}

exports.update_venue = async function(args, res, next) {
  /**
   * Update a venue
   *
   * venue_id String resource id of venue
   * venue Venue Definition of venue
   * no response value expected for this operation
   **/

  let venue_id = args['venue_id']['value'];
  let venue = args['venue']['value'];

  try {
    const data = await node_funcs.updateVenue(venue_id, venue);
    res.status(204).end();
  } catch (err_obj) {
    res.status(err_obj['error_code']).json({'message': err_obj['message']});
  }
}
