'use strict';

module.exports = function (grunt) {

  grunt.registerTask('release', 'Build & bump', function(target) {
    grunt.run('bump-only:' + target);
    grunt.run('build');
    grunt.run('bump-commit');
  });
};
