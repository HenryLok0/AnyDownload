module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.js'],
    testPathIgnorePatterns: ['/node_modules/', '/test-output/'],
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/**/*.test.js'
    ]
};
