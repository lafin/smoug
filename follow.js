const async = require('async');
const base = require('./base');
const config = require('./config');

function doVk(value) {
    console.log(value.url, 'doFollowVk');
    let [type, ownerId] = base.getItemData(value.url);

    let url = `${config.secondApiUrl}/method/groups.join?group_id=${ownerId}&access_token=${value.token}&v=${config.secondApiVersion}`;
    if (type === 'id') {
        url = `${config.secondApiUrl}/method/friends.add?user_id=${ownerId}&access_token=${value.token}&v=${config.secondApiVersion}`;
    }

    return base.pr({
        url,
        jar: base.jarSecond,
        json: true,
    })
    .then(data => base.validateVk(data, value));
}

function undoVk(value) {
    console.log(value.url, 'doUnfollowVk');
    let [type, ownerId] = base.getItemData(value.url);

    let url = `${config.secondApiUrl}/method/groups.leave?group_id=${ownerId}&access_token=${value.token}&v=${config.secondApiVersion}`;
    if (type === 'id') {
        url = `${config.secondApiUrl}/method/friends.delete?user_id=${ownerId}&access_token=${value.token}&v=${config.secondApiVersion}`;
    }

    return base.pr({
        url,
        jar: base.jarSecond,
        json: true,
    })
    .then(data => base.validateVk(data, value));
}

function doAction(values) {
    return new Promise((resolve, reject) => {
        async.mapSeries(values, (value, callback) => base.delay(500)
        .then(() => doVk(value))
        .then(() => base.delay(1500))
        .then(() => base.doCheck(value))
        .then(() => undoVk(value))
        .then(() => callback(null)), (error, values) => {
            if (error) {
                return reject(error);
            }
            return resolve(values);
        });
    });
}

module.exports = {
    doAction
};
