module.exports = {
  apps: [{
    name: 'sukii-discord',
    script: 'index.js',
    interpreter: 'node',
    watch: false,
    restart_delay: 10000,
    exp_backoff_restart_delay: 100,
    max_restarts: 10,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
