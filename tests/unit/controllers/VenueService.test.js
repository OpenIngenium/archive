'use strict';

jest.mock('../../../api/base_funcs');
jest.mock('../../../api/node_funcs');

const base_funcs = require('../../../api/base_funcs');
const node_funcs = require('../../../api/node_funcs');
const VenueService = require('../../../controllers/VenueService');
const { makeArgs, makeRes, makeNext } = require('../mocks/testHelpers');

beforeEach(() => {
  base_funcs.push_error.mockImplementation((msg, err) => ({ message: msg, err }));
  base_funcs.sanitize_internal_attrs.mockImplementation((x) => x);
});

describe('VenueService.create_venue', () => {
  test('creates a venue', async () => {
    node_funcs.createVenue.mockResolvedValue({ id: 'v1' });
    const res = makeRes();
    await VenueService.create_venue(makeArgs({ venue: { name: 'v' } }), res, makeNext());
    expect(node_funcs.createVenue).toHaveBeenCalledWith({ name: 'v' });
    expect(res.json).toHaveBeenCalledWith({ id: 'v1' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.createVenue.mockRejectedValue('boom');
    const res = makeRes();
    await VenueService.create_venue(makeArgs({ venue: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when creating a venue', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('VenueService.delete_venue', () => {
  test('deletes and returns 204', async () => {
    node_funcs.deleteVenue.mockResolvedValue({});
    const res = makeRes();
    await VenueService.delete_venue(makeArgs({ venue_id: 'v1' }), res, makeNext());
    expect(node_funcs.deleteVenue).toHaveBeenCalledWith('v1');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  test('returns 400 on failure', async () => {
    node_funcs.deleteVenue.mockRejectedValue('boom');
    const res = makeRes();
    await VenueService.delete_venue(makeArgs({ venue_id: 'v1' }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when deleting a venue', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('VenueService.get_venue', () => {
  test('returns the sanitized venue', async () => {
    node_funcs.getVenue.mockResolvedValue({ id: 'v1', _key: '1' });
    const res = makeRes();
    await VenueService.get_venue(makeArgs({ venue_id: 'v1' }), res, makeNext());
    expect(base_funcs.sanitize_internal_attrs).toHaveBeenCalledWith({ id: 'v1', _key: '1' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('returns 404 when not found', async () => {
    node_funcs.getVenue.mockRejectedValue('No venue was found: v1');
    const res = makeRes();
    await VenueService.get_venue(makeArgs({ venue_id: 'v1' }), res, makeNext());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 400 for other errors', async () => {
    node_funcs.getVenue.mockRejectedValue('database offline');
    const res = makeRes();
    await VenueService.get_venue(makeArgs({ venue_id: 'v1' }), res, makeNext());
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('VenueService.get_venue_status', () => {
  test('returns the venue status', async () => {
    node_funcs.getVenue.mockResolvedValue({ venue_status: { status: 'AVAILABLE' } });
    const res = makeRes();
    await VenueService.get_venue_status(makeArgs({ venue_id: 'v1' }), res, makeNext());
    expect(res.json).toHaveBeenCalledWith({ status: 'AVAILABLE' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.getVenue.mockRejectedValue('boom');
    const res = makeRes();
    await VenueService.get_venue_status(makeArgs({ venue_id: 'v1' }), res, makeNext());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'boom' });
  });
});

describe('VenueService.get_venues', () => {
  test('uses defaults and sets total count header', async () => {
    node_funcs.getVenues.mockResolvedValue({ total_count: 2, venues: [{ id: 1 }] });
    const res = makeRes();
    const args = makeArgs({
      offset: 0, limit: 0, sort: null, status: null, exclude_status: null,
      description: null, venue_type: null, venue_name: null, venue_group_name: null, venue_group_status: null
    });

    await VenueService.get_venues(args, res, makeNext());

    expect(node_funcs.getVenues).toHaveBeenCalledWith(0, 10, 'ASC', null, null, null, null, null, null, null);
    expect(res.set).toHaveBeenCalledWith('x-total-count', 2);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  test('passes through provided parameters', async () => {
    node_funcs.getVenues.mockResolvedValue({ total_count: 0, venues: [] });
    const res = makeRes();
    const args = makeArgs({
      offset: 3, limit: 5, sort: 'DESC', status: 'IN_USE', exclude_status: 'DOWN',
      description: 'd', venue_type: 't', venue_name: 'n', venue_group_name: 'g', venue_group_status: 'ACTIVE'
    });

    await VenueService.get_venues(args, res, makeNext());

    expect(node_funcs.getVenues).toHaveBeenCalledWith(3, 5, 'DESC', 'IN_USE', 'DOWN', 'd', 't', 'n', 'g', 'ACTIVE');
  });

  test('returns 400 on failure', async () => {
    node_funcs.getVenues.mockRejectedValue('boom');
    const res = makeRes();
    const args = makeArgs({
      offset: 0, limit: 0, sort: null, status: null, exclude_status: null,
      description: null, venue_type: null, venue_name: null, venue_group_name: null, venue_group_status: null
    });

    await VenueService.get_venues(args, res, makeNext());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'boom' });
  });
});

describe('VenueService.set_venue_status', () => {
  test('updates status and returns 204', async () => {
    node_funcs.updateVenueStatus.mockResolvedValue({});
    const res = makeRes();
    await VenueService.set_venue_status(makeArgs({ venue_id: 'v1', venue_status: { status: 'DOWN' } }), res, makeNext());
    expect(node_funcs.updateVenueStatus).toHaveBeenCalledWith('v1', { status: 'DOWN' });
    expect(res.status).toHaveBeenCalledWith(204);
  });

  test('returns the error code from the rejection object', async () => {
    node_funcs.updateVenueStatus.mockRejectedValue({ error_code: 404, message: 'missing' });
    const res = makeRes();
    await VenueService.set_venue_status(makeArgs({ venue_id: 'v1', venue_status: {} }), res, makeNext());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'missing' });
  });
});

describe('VenueService.update_venue', () => {
  test('updates and returns 204', async () => {
    node_funcs.updateVenue.mockResolvedValue({});
    const res = makeRes();
    await VenueService.update_venue(makeArgs({ venue_id: 'v1', venue: { name: 'v' } }), res, makeNext());
    expect(node_funcs.updateVenue).toHaveBeenCalledWith('v1', { name: 'v' });
    expect(res.status).toHaveBeenCalledWith(204);
  });

  test('returns the error code from the rejection object', async () => {
    node_funcs.updateVenue.mockRejectedValue({ error_code: 409, message: 'conflict' });
    const res = makeRes();
    await VenueService.update_venue(makeArgs({ venue_id: 'v1', venue: {} }), res, makeNext());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ message: 'conflict' });
  });
});
