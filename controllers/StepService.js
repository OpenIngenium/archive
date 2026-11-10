'use strict';
var base_funcs = require('../api/base_funcs');
var node_funcs = require('../api/node_funcs');

exports.get_step = async function(args, res, next) {
  /**
   * Get step definition and result
   *
   * elem_id String unique id of a procedure element
   * returns List
   **/
  let elem_id = args['elem_id']['value'];
  
  try {
    const data = await node_funcs.getStep(elem_id);
    res.status(200).json(data);    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when getting a step', err);
    res.status(400).json(err_data);
  }
}

exports.get_step_input = async function(args, res, next) {
  /**
   * Get user input of a step
   *
   * elem_id String unique id of a procedure element
   * returns Object
   **/
  let elem_id = args['elem_id']['value'];

  try {
    const step = await node_funcs.getStep(elem_id);
    if (step.hasOwnProperty('execution_user_input')) {
      res.status(200).json(step['execution_user_input']);
    } else {
      res.status(200).json({});      
    }
  } catch (err) {
    const err_data = base_funcs.push_error('Error when getting input of a step', err);
    res.status(400).json(err_data);
  }
}

exports.get_step_result = async function(args, res, next) {
  /**
   * Get result of a step
   *
   * elem_id String unique id of a procedure element
   * returns StepResult
   **/
  let elem_id = args['elem_id']['value'];

  try {
    const step = await node_funcs.getStep(elem_id);
    if (step.hasOwnProperty('execution')) {
      res.status(200).json(step['execution']);
    } else {
      res.status(200).json({});      
    }
  } catch (err) {
    const err_data = base_funcs.push_error('Error when getting result of a step', err);
    res.status(400).json(err_data);
  }
}

exports.update_step = async function(args, res, next) {
  /**
   * Update a step
   *
   * elem_id String unique id of a procedure element
   * step Step Definition of step
   * no response value expected for this operation
   **/

  let elem_id = args['elem_id']['value'];
  let step = args['step']['value'];

  try {
    const data = await node_funcs.updateElement(elem_id, step);
    res.status(200).json(data);    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when updating a step', err);
    res.status(400).json(err_data);
  }   
}

exports.update_step_input = async function(args, res, next) {
  /**
   * Update user input of a step
   *
   * elem_id String unique id of a procedure element
   * user_input Object User input values
   * no response value expected for this operation
   **/
  let elem_id = args['elem_id']['value'];
  let user_input = args['user_input']['value'];

  try {
    const data = await node_funcs.setStepInput(elem_id, user_input);
    res.status(204).end();    
  } catch (err) {
    const err_data = base_funcs.push_error('Error when updating input of a step', err);
    res.status(400).json(err_data);
  }  
}

exports.update_step_result = async function(args, res, next) {
  /**
   * Update result of a step
   *
   * elem_id String unique id of a procedure element
   * result StepResult Result of step
   * no response value expected for this operation
   **/
  let elem_id = args['elem_id']['value'];
  let result = args['result']['value'];

  try {
    const data = await node_funcs.setStepOutput(elem_id, result);
    res.status(200).json(data);
  } catch (err) {
    const err_data = base_funcs.push_error('Error when updating result of a step', err);
    res.status(400).json(err_data);
  } 
}

exports.create_new_run = async function(args, res, next) {
  /**
   * Create a copy of the step to run it again
   *
   * elem_id String unique id of the step
   * returns StepWithRunRecords
   **/
  let elem_id = args['elem_id']['value'];

  try {
    const step = await node_funcs.createNewRun(elem_id);
    res.status(200).json(step);
  } catch (err) {
    const err_data = base_funcs.push_error('Error when creating a new run of a step', err);
    res.status(400).json(err_data);
  }
}