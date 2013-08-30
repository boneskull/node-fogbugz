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
          fogbugz = loadModule('./lib/fogbugz.js',
              {
                request: request,
                '../fogbugz.conf.json': './fogbugz-example.conf.json'
              }).module.exports;

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
          fogbugz = loadModule('./lib/fogbugz.js',
              {
                request: request,
                '../fogbugz.conf.json': require('./fogbugz-example.conf.json')
              }).module.exports;

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
      var fogbugz = loadModule('./lib/fogbugz.js', {
        '../fogbugz.conf.json': require('./fogbugz-example.conf.json')
      }).module.exports;

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
          fogbugz = loadModule('./lib/fogbugz.js',
              {
                request: request,
                '../fogbugz.conf.json': require('./fogbugz-example.conf.json')
              }).module.exports;
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
          fogbugz = loadModule('./lib/fogbugz.js',
              {
                request: request,
                '../fogbugz.conf.json': require('./fogbugz-example.conf.json')
              }).module.exports;
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
          fogbugz = loadModule('./lib/fogbugz.js', {
            request: request,
            '../fogbugz.conf.json': require('./fogbugz-example.conf.json')
          }).module.exports;

      fogbugz.setToken('capybara');
      fogbugz.listFilters()
          .then(function (res) {
            expect(res).toEqual([
              {"name": "My Cases", "type": "builtin", "id": "ez", "url": "https://zzz.fogbugz.com/default.asp?pgx=LF&ixFilter=ez"},
              {"name": "Inbox", "type": "builtin", "id": "inbox", "url": "https://zzz.fogbugz.com/default.asp?pgx=LF&ixFilter=inbox"}
            ]
            );
          }, function () {
            expect(true).toBe(false);
          })
          .finally(fogbugz.forgetToken)
          .finally(done);

    });
  });


});
