const async = require('async');
const auth = require('./auth');
const base = require('./base');
const like = require('./like');
const follow = require('./follow');
const config = require('./config');

const vars = ['SMO_LOGIN', 'SMO_PASS', 'VK_CLIENT_ID', 'VK_LOGIN', 'VK_PASS'];
for (const i in vars) {
    const key = vars[i];
    if (!process.env.hasOwnProperty(key)) {
        console.log("doesn't have enough environment variables", key);
        process.exit(1);
    }
}

auth.getCsrfToken()
.then(firstToken => auth.doAuthFirst(firstToken))

.then(() => auth.doAuthSecond())
.then(secondToken => new Promise((resolve, reject) => {
    async.timesSeries(config.countCicle, (n, callback) => {
        base.getListTask(secondToken, 'tasks/vkontakte/subscribe/')
        .then(values => base.fillLinkTask(values))
        .then(values => follow.doAction(values))
        .then(() => {
            console.log('loop');
            return callback(null);
        })
        .catch(error => callback(error));
    }, (error) => {
        if (error) {
            return reject(error);
        }
        return resolve(secondToken);
    });
}))
.then(secondToken => new Promise((resolve, reject) => {
    async.timesSeries(config.countCicle, (n, callback) => {
        base.getListTask(secondToken, 'tasks/vkontakte/like/')
        .then(values => base.fillLinkTask(values))
        .then(values => like.doAction(values))
        .then(() => {
            console.log('loop');
            return callback(null);
        })
        .catch(error => callback(error));
    }, (error) => {
        if (error) {
            return reject(error);
        }
        return resolve(secondToken);
    });
}))
.catch((error) => {
    console.error(error);
});
