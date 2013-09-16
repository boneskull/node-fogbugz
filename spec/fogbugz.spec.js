var Q = require('q'),
  loadModule = require('./module-loader').loadModule,
  inspect = require('util').inspect,

  dump = function dump(o) {
    return inspect(o, {depth: null});
  };

describe('fogbugz module', function () {

  describe('logon method', function () {

    it('should fail if error received', function (done) {
      var msg = 'error',
        request = jasmine.createSpy('request')
          .andCallFake(function (url, cb) {
            cb(msg);
          }),
        mocks = {
          request: request
        },
        fogbugz;
      fogbugz = loadModule('./index.js', mocks).module.exports;
      fogbugz.logon()
        .then(function () {
          expect(true).toBe(false);
        }, function (err) {
          expect(err).toBe(msg);
        })
        .finally(fogbugz.forgetToken)
        .finally(done);
    });

    it('should successfully login', function (done) {
      var token = 'capybara',
        xml = '<response><token><![CDATA[' + token +
              ']]></token></response>',
        request = jasmine.createSpy('request')
          .andCallFake(function (url, cb) {
            cb(null, null, xml);
          }),
        mocks = {
          request: request
        },
        fogbugz;
      fogbugz = loadModule('./index.js', mocks).module.exports;

      fogbugz.logon()
        .then(function (res) {
          expect(res.token).toBe(token);
          expect(res.cached).toBeFalsy();
        })
        .then(fogbugz.logon)
        .then(function (res) {
          expect(res.token).toBe(token);
          expect(res.cached).toBeTruthy();
        })
        .finally(fogbugz.forgetToken)
        .finally(done);
    });
  });

  describe('logoff method', function (done) {
    it('should fail w/o presence of token', function () {
      var mocks = {},
        fogbugz;
      fogbugz = loadModule('./index.js', mocks).module.exports;
      fogbugz.logoff()
        .then(function () {
          expect(true).toBe(false);
        }, function (err) {
          expect(err).toBe(fogbugz.MODULE_ERRORS.undefined_token);
        })
        .finally(fogbugz.forgetToken)
        .finally(done);
    });

    it('should fail if error received', function (done) {
      var msg = 'error',
        request = jasmine.createSpy('request')
          .andCallFake(function (url, cb) {
            cb(msg);
          }),
        mocks = {
          request: request
        },
        fogbugz;
      fogbugz = loadModule('./index.js', mocks).module.exports;
      fogbugz.setToken('capybara');
      fogbugz.logoff()
        .then(function () {
          expect(true).toBe(false);
        }, function (err) {
          expect(err).toBe(msg);
        })
        .finally(fogbugz.forgetToken)
        .finally(done);
    });

    it('should succeed if no error (?)', function (done) {
      var request = jasmine.createSpy('request')
          .andCallFake(function (url, cb) {
            cb();
          }),
        mocks = {
          request: request
        },
        fogbugz;
      fogbugz = loadModule('./index.js', mocks).module.exports;
      fogbugz.setToken('capybara');
      fogbugz.logoff()
        .then(function (res) {
          expect(res).toBe(true);
        })
        .finally(fogbugz.forgetToken)
        .finally(done);
    });

  });

  describe('listFilters method', function () {
    it('should get a list of available filters', function (done) {
      var filtersXml = '<response><filters><filter type="builtin" sFilter="ez">My Cases</filter><filter type="builtin" sFilter="inbox">Inbox</filter></filters></response>',
        request = jasmine.createSpy('request')
          .andCallFake(function (url, cb) {
            cb(null, null, filtersXml);
          }),
        mocks = {
          request: request
        },
        fogbugz;
      fogbugz = loadModule('./index.js', mocks).module.exports;
      fogbugz.setToken('capybara');
      fogbugz.listFilters()
        .then(function (res) {
          expect(res).toEqual([
            new fogbugz.Filter({"name": "My Cases", "type": "builtin", "id": "ez", "url": "https://zzz.fogbugz.com/default.asp?pgx=LF&ixFilter=ez"}),
            new fogbugz.Filter({"name": "Inbox", "type": "builtin", "id": "inbox", "url": "https://zzz.fogbugz.com/default.asp?pgx=LF&ixFilter=inbox"})
          ]);
        }, function () {
          expect(true).toBe(false);
        })
        .finally(fogbugz.forgetToken)
        .finally(done);
    });
  });

  describe('setCurrentFilter method', function () {
    it('shoud set the current filter', function (done) {
      var xml = '<response></response>',
        request = jasmine.createSpy('request')
          .andCallFake(function (url, cb) {
            cb(null, null, xml);
          }),
        mocks = {
          request: request
        },
        fogbugz;
      fogbugz = loadModule('./index.js', mocks).module.exports;
      fogbugz.setToken('capybara');
      fogbugz.setCurrentFilter('ez')
        .then(function (res) {
          expect(res).toBe(true);
        })
        .finally(fogbugz.forgetToken)
        .finally(done);
    });

  });

  describe('search method', function () {
    it('should perform a search', function (done) {
      var xml = '<response><cases count="7"><case ixBug="16006" operations="edit,assign,resolve,email,remind"><sTitle><![CDATA[AQ toolkit API: bar chart shown and selected for text]]></sTitle><sFixFor><![CDATA[whenever]]></sFixFor><sStatus><![CDATA[ Active ]]></sStatus></case></cases></response>',
        request = jasmine.createSpy('request')
          .andCallFake(function (url, cb) {
            cb(null, null, xml);
          }),
        fogbugz = loadModule('./index.js',
          {
            request: request
          }).module.exports;

      fogbugz.setToken('capybara');
      fogbugz.search('16227')
        .then(function (res) {
          expect(res).toEqual(
            new fogbugz.Case({
                status: "Active",
                title: "AQ toolkit API: bar chart shown and selected for text",
                operations: ["edit", "assign", "resolve", "email", "remind"],
                id: "16006",
                url: "https://zzz.fogbugz.com/default.asp?16006",
                fixFor: "whenever"
              }
            ));
        }, function (err) {
          console.error(err);
          expect(true).toBe(false);
        })
        .finally(fogbugz.forgetToken)
        .finally(done);

    });
  });

});
