module.exports = function (grunt) {

  // Project configuration.
  grunt.initConfig({
    jasmine_node: {
      projectRoot: "./spec"
    }
  });

  grunt.loadNpmTasks('grunt-jasmine-node');

  grunt.registerTask('test', ['jasmine_node']);
  grunt.registerTask('default', ['test']);

};
