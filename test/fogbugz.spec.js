'use strict';

var rewire = require('rewire');
var fogbugz = rewire('../index');

describe('fogbugz', function () {

  var sandbox;
  var TOKEN = 'capybara';

  beforeEach(function () {
    sandbox = sinon.sandbox.create('fogbugz');
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('editBug()', function () {
    var emptyXml = '<response></response>';
    var editBugXml = '<response><case ixBug="16006" ' +
      'operations="edit,assign,resolve,email,remind"><sTitle>' +
      '<![CDATA[AQ toolkit API: bar chart shown and selected for text]]>' +
      '</sTitle><sFixFor><![CDATA[whenever]]></sFixFor><sStatus>' +
      '<![CDATA[ Active ]]></sStatus><sFooBar><![CDATA[FOO FOO FOO]]>' +
      '</sFooBar></case></response>';

    beforeEach(function () {
      fogbugz.setToken(TOKEN);
    });

    afterEach(function () {
      fogbugz.forgetToken();
    });

    function editBugRequest(xml) {
      return sandbox.spy(function (url, cb) {
        cb(null, null, xml || editBugXml);
      });
    }

    it('should fail if id is not found', function () {
      fogbugz.__set__('request', editBugRequest(emptyXml));

      return expect(fogbugz.editBug(16227, {}, []))
        .to.eventually.be.rejectedWith(fogbugz.MODULE_ERRORS.xmlParseError);
    });

    it('should find the requested bug', function () {
      var testId = '16006';

      fogbugz.__set__('request', editBugRequest(editBugXml));

      return fogbugz.editBug(testId, {}, [])
        .then(function (fbzCase) {
          expect(fbzCase.id).to.equal(testId);
          expect(fbzCase.title)
            .to.equal('AQ toolkit API: bar chart shown and selected for text');
        });
    });
  });

  describe('logon()', function () {

    it('should fail if error received', function () {
      var msg = 'error';

      fogbugz.__set__('request', sandbox.spy(function (url, cb) {
        cb(msg);
      }));

      return expect(fogbugz.logon()).to.eventually.be.rejectedWith(msg);
    });

    it('should successfully login', function () {
      var token = TOKEN;
      var xml = '<response><token><![CDATA[' + token +
        ']]></token></response>';

      fogbugz.__set__('request', sandbox.spy(function (url, cb) {
        cb(null, null, xml);
      }));

      return fogbugz.logon()
        .then(function (res) {
          expect(res.token).to.equal(token);
          expect(res.cached).to.be.false;
        })
        .then(fogbugz.logon)
        .then(function (res) {
          expect(res.token).to.equal(token);
          expect(res.cached).to.exist;
        });
    });
  });

  describe('logoff()', function () {
    it('should fail w/o presence of token', function () {
      fogbugz.forgetToken();
      return expect(fogbugz.logoff()).to.eventually.be
        .rejectedWith(fogbugz.MODULE_ERRORS.undefinedToken);
    });

    it('should fail if error received', function () {
      var msg = 'error';

      fogbugz.__set__('request', sandbox.spy(function (url, cb) {
        cb(msg);
      }));

      fogbugz.setToken(TOKEN);
      return expect(fogbugz.logoff()).to.eventually.be.rejectedWith(msg)
        .then(function () {
          fogbugz.forgetToken();
        });
    });

    it('should succeed if no error (?)', function () {
      fogbugz.__set__('request', sandbox.spy(function (url, cb) {
        cb();
      }));
      fogbugz.setToken(TOKEN);
      return expect(fogbugz.logoff()).to.eventually.be.true
        .then(function () {
          fogbugz.forgetToken();
        });
    });

  });

  describe('listFilters()', function () {
    beforeEach(function () {
      fogbugz.setToken(TOKEN);
    });

    afterEach(function () {
      fogbugz.forgetToken();
    });

    it('should get a list of available filters', function () {
      var filtersXml = '<response><filters><filter type="builtin" ' +
        'sFilter="ez">My Cases</filter><filter type="builtin" ' +
        'sFilter="inbox">Inbox</filter></filters></response>';

      fogbugz.__set__('request', sandbox.spy(function (url, cb) {
        cb(null, null, filtersXml);
      }));

      return expect(fogbugz.listFilters()).to.eventually.eql([
        new fogbugz.Filter({
          'name': 'My Cases',
          'type': 'builtin',
          'id': 'ez',
          'url': 'https://zzz.fogbugz.com/default.asp?pgx=LF&ixFilter=ez'
        }),
        new fogbugz.Filter({
          'name': 'Inbox',
          'type': 'builtin',
          'id': 'inbox',
          'url': 'https://zzz.fogbugz.com/default.asp?pgx=LF&ixFilter=inbox'
        })
      ]);
    });
  });

  describe('setCurrentFilter()', function () {
    beforeEach(function () {
      fogbugz.setToken(TOKEN);
    });

    afterEach(function () {
      fogbugz.forgetToken();
    });

    it('shoud set the current filter', function () {
      var xml = '<response></response>';
      fogbugz.__set__('request', sandbox.spy(function (url, cb) {
        cb(null, null, xml);
      }));
      return expect(fogbugz.setCurrentFilter('ez')).to.eventually.be.true;
    });

  });

  describe('search()', function () {
    beforeEach(function () {
      fogbugz.setToken(TOKEN);
    });

    afterEach(function () {
      fogbugz.forgetToken();
    });

    it('should perform a search', function () {
      var xml = '<response><cases count="7"><case ixBug="16006" ' +
        'operations="edit,assign,resolve,email,remind"><sTitle><![CDATA[AQ ' +
        'toolkit API: bar chart shown and selected for' +
        ' text]]></sTitle><sFixFor><![CDATA[whenever]]></sFixFor><sStatus>' +
        '<![CDATA[ Active ]]></sStatus><sFooBar><![CDATA[FOO FOO FOO]]>' +
        '</sFooBar></case></cases></response>';

      fogbugz.__set__('request', sandbox.spy(function (url, cb) {
        cb(null, null, xml);
      }));

      return expect(fogbugz.search('16227', ['sFooBar'])).to.eventually.eql(
        new fogbugz.Case({
            status: 'Active',
            title: 'AQ toolkit API: bar chart shown and selected for text',
            operations: ['edit', 'assign', 'resolve', 'email', 'remind'],
            id: '16006',
            url: 'https://zzz.fogbugz.com/default.asp?16006',
            fixFor: 'whenever',
            sFooBar: 'FOO FOO FOO',
            _raw: {
              '$': {
                ixBug: '16006',
                operations: 'edit,assign,resolve,email,remind'
              },
              sTitle: [
                'AQ toolkit API: bar chart shown and selected for ' +
                'text'
              ],
              sFixFor: ['whenever'],
              sStatus: [' Active '],
              sFooBar: ['FOO FOO FOO']
            }
          }
        ));
    });
  });

});
