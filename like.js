const async = require('async');
const base = require('./base');
const config = require('./config');

function doVk(value) {
    console.log(value.url, 'doLikeVk');
    let [type, ownerId, itemId] = base.getItemData(value.url);

    return base.pr({
        url: `${config.secondApiUrl}/method/likes.add?type=${type}&item_id=${itemId}&owner_id=${ownerId}&access_token=${value.token}&v=${config.secondApiVersion}`,
        jar: base.jarSecond,
        json: true,
    })
    .then(data => base.validateVk(data, value));
}

function undoVk(value) {
    console.log(value.url, 'doDislikeVk');
    let [type, ownerId, itemId] = base.getItemData(value.url);

    return base.pr({
        url: `${config.secondApiUrl}/method/likes.delete?type=${type}&item_id=${itemId}&owner_id=${ownerId}&access_token=${value.token}&v=${config.secondApiVersion}`,
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
