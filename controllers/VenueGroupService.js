'use strict';

var base_funcs = require('../api/base_funcs');
var node_funcs = require('../api/node_funcs');
var log = base_funcs.log;

exports.create_venue_group = async function(args, res, next) {
  /**
   * Create a venue group
   *
   * venue_group VenueGroupInput Definition of venue group
   * returns VenueGroup
   **/
  let venueGroupInput = args['venue_group']['value'];

  try {
    const data = await node_funcs.createVenueGroup(venueGroupInput);
    res.status(200).json(data);
  } catch(err) {
    const err_data = base_funcs.push_error('Error when creating a venue group', err);
    res.status(400).json(err_data);
  }
}

exports.get_venue_groups = async function(args, res, next) {
    /**
     * Get list of venue groups. List is sorted by name by default.
     *
     * offset Integer Start index for pagination. zero based. (optional)
     * limit Integer Max number of elements to return. (optional)
     * sort String Sort in natural order * `ASC` - Ascending * `DESC` - Descending  (optional)
     * status String Filter on venue status * `ACTIVE` * `INACTIVE` (optional)
     * venue_group_name name of venue group (optional)
     * description String Query for words in description (optional)
     * returns List
     **/
    let offset = args['offset']['value'] || 0;
    let limit = args['limit']['value'] || 10;
    let sort = args['sort']['value'] || 'ASC';
    let status = args['status']['value'] || null;
    let venue_group_name = args['venue_group_name']['value'] || null;
    let description = args['description']['value'] || null;

    try {
      const data = await node_funcs.getVenueGroups(offset, limit, sort, status, venue_group_name, description);
      res.status(200)
      .set('x-total-count', data['total_count'])
      .json(data['data']);    
    } catch (err) {
      res.status(400).json({'message': err});
    }
  }

exports.get_venue_group = async function(args, res, next) {
  /**
   * Get venue Group
   *
   * venue_group_id String resource id of venue group
   * returns venue group
   **/
  let venue_group_id = args['venue_group_id']['value'];

  try {
    const data = await node_funcs.getVenueGroup(venue_group_id);
    res.status(200).json(base_funcs.sanitize_internal_attrs(data));
  } catch (err) {
    if (err.startsWith('No venue group was found')) {
      res.status(404).json({'message': err})
    } else {
      res.status(400).json({'message': err})
    }
  }
}

exports.update_venue_group = async function(args, res, next) {
  /**
   * Update a venue group
   *
   * venue_group_id String resource id of venue group
   * venue_group VenueGroup Definition of venue group
   * no response value expected for this operation
   **/

  let venue_group_id = args['venue_group_id']['value'];
  let venue_group = args['venue_group']['value'];

  try {
    const data = await node_funcs.updateVenueGroup(venue_group_id, venue_group);
    res.status(204).end();
  } catch (err_obj) {
    res.status(err_obj['error_code']).json({'message': err_obj['message']});
  }
}
