'use strict';

jest.mock('../../../api/base_funcs');
jest.mock('../../../api/node_funcs');

const base_funcs = require('../../../api/base_funcs');
const node_funcs = require('../../../api/node_funcs');
const VenueGroupService = require('../../../controllers/VenueGroupService');
const { makeArgs, makeRes, makeNext } = require('../mocks/testHelpers');

beforeEach(() => {
  base_funcs.push_error.mockImplementation((msg, err) => ({ message: msg, err }));
  base_funcs.sanitize_internal_attrs.mockImplementation((x) => x);
});

describe('VenueGroupService.create_venue_group', () => {
  test('creates a venue group', async () => {
    node_funcs.createVenueGroup.mockResolvedValue({ id: 'vg1' });
    const res = makeRes();
    await VenueGroupService.create_venue_group(makeArgs({ venue_group: { name: 'g' } }), res, makeNext());
    expect(node_funcs.createVenueGroup).toHaveBeenCalledWith({ name: 'g' });
    expect(res.json).toHaveBeenCalledWith({ id: 'vg1' });
  });

  test('returns 400 on failure', async () => {
    node_funcs.createVenueGroup.mockRejectedValue('boom');
    const res = makeRes();
    await VenueGroupService.create_venue_group(makeArgs({ venue_group: {} }), res, makeNext());
    expect(base_funcs.push_error).toHaveBeenCalledWith('Error when creating a venue group', 'boom');
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('VenueGroupService.get_venue_groups', () => {
  test('uses defaults and sets total count header', async () => {
    node_funcs.getVenueGroups.mockResolvedValue({ total_count: 3, data: [{ id: 1 }] });
    const res = makeRes();
    const args = makeArgs({ offset: 0, limit: 0, sort: null, status: null, venue_group_name: null, description: null });

    await VenueGroupService.get_venue_groups(args, res, makeNext());

    expect(node_funcs.getVenueGroups).toHaveBeenCalledWith(0, 10, 'ASC', null, null, null);
    expect(res.set).toHaveBeenCalledWith('x-total-count', 3);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  test('passes through provided query parameters', async () => {
    node_funcs.getVenueGroups.mockResolvedValue({ total_count: 1, data: [] });
    const res = makeRes();
    const args = makeArgs({ offset: 5, limit: 20, sort: 'DESC', status: 'ACTIVE', venue_group_name: 'g', description: 'd' });

    await VenueGroupService.get_venue_groups(args, res, makeNext());

    expect(node_funcs.getVenueGroups).toHaveBeenCalledWith(5, 20, 'DESC', 'ACTIVE', 'g', 'd');
  });

  test('returns 400 on failure', async () => {
    node_funcs.getVenueGroups.mockRejectedValue('boom');
    const res = makeRes();
    const args = makeArgs({ offset: 0, limit: 0, sort: null, status: null, venue_group_name: null, description: null });

    await VenueGroupService.get_venue_groups(args, res, makeNext());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'boom' });
  });
});

describe('VenueGroupService.get_venue_group', () => {
  test('returns the sanitized venue group', async () => {
    node_funcs.getVenueGroup.mockResolvedValue({ id: 'vg1', _key: '1' });
    const res = makeRes();
    await VenueGroupService.get_venue_group(makeArgs({ venue_group_id: 'vg1' }), res, makeNext());
    expect(base_funcs.sanitize_internal_attrs).toHaveBeenCalledWith({ id: 'vg1', _key: '1' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('returns 404 when the venue group is not found', async () => {
    node_funcs.getVenueGroup.mockRejectedValue('No venue group was found for id vg1');
    const res = makeRes();
    await VenueGroupService.get_venue_group(makeArgs({ venue_group_id: 'vg1' }), res, makeNext());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 400 for other errors', async () => {
    node_funcs.getVenueGroup.mockRejectedValue('database offline');
    const res = makeRes();
    await VenueGroupService.get_venue_group(makeArgs({ venue_group_id: 'vg1' }), res, makeNext());
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('VenueGroupService.update_venue_group', () => {
  test('updates and returns 204', async () => {
    node_funcs.updateVenueGroup.mockResolvedValue({});
    const res = makeRes();
    await VenueGroupService.update_venue_group(makeArgs({ venue_group_id: 'vg1', venue_group: { name: 'g' } }), res, makeNext());
    expect(node_funcs.updateVenueGroup).toHaveBeenCalledWith('vg1', { name: 'g' });
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  test('returns the error code from the rejection object', async () => {
    node_funcs.updateVenueGroup.mockRejectedValue({ error_code: 409, message: 'conflict' });
    const res = makeRes();
    await VenueGroupService.update_venue_group(makeArgs({ venue_group_id: 'vg1', venue_group: {} }), res, makeNext());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ message: 'conflict' });
  });
});
