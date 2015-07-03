'use strict';

var chai = require('chai');

global.expect = chai.expect;
global.sinon = require('sinon');

chai.use(require('sinon-chai'));
chai.use(require('chai-as-promised'));

process.env.NODE_FOGBUGZ_CONFIG =
  require('path').join(__dirname, 'fogbugz.conf.json');
