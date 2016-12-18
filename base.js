const request = require('request');
const async = require('async');
const config = require('./config');

const jarFirst = request.jar();
const jarSecond = request.jar();

function pr(options) {
    const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.75 Safari/537.36',
    };
    options.headers = Object.assign({}, options.headers, defaultHeaders) || defaultHeaders;
    return new Promise(
    (resolve, reject) => {
        request(options,
        (error, response, body) => {
            if (error) {
                reject(error);
            } else {
                resolve({
                    response,
                    body,
                });
            }
        });
    });
}

function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function validateVk(data, value) {
    if (data.body.error) {
        if (data.body.error.error_code === 100) {
            return doSkip(value);
        } else if (data.body.error.error_code === 14) {
            console.log(value.url, 'captcha');
            throw new Error();
        } else {
            console.log(value.url, data.body.error.error_msg);
            throw new Error();
        }
    }
}

function doSkip(value) {
    return pr({
        url: `${config.firstUrl}tasks/delete/`,
        method: 'post',
        form: {
            id: value.id,
            YII_CSRF_TOKEN: value.csrf,
        },
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
        },
        jar: jarFirst,
    })
    .then(() => {
        console.log(value.id, 'skip');
    });
}

function getItemData(id) {
    const patters = id.match(/^http:\/\/(m\.)?vk\.com\/([a-z]+)(-?\d+)_?(\d+)?$/mi);
    let [type, ownerId, itemId] = [...patters.slice(2)];

    if (type === 'wall') {
        type = 'post';
    }

    return [
        type,
        ownerId,
        itemId,
    ];
}

function doCheck(value) {
    return pr({
        url: `${config.firstUrl}tasks/check/`,
        method: 'post',
        form: {
            id: value.id,
            count: 1,
            bot_check: 1,
            YII_CSRF_TOKEN: value.csrf,
        },
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
        },
        jar: jarFirst,
    })
    .then((data) => {
        if (data.body) {
            try {
                const body = JSON.parse(data.body);
                console.log(body.error);
            } catch (e) {
                console.warn(e);
            }
        }
    });
}

function getListTask(token, path) {
    return pr({
        url: `${config.firstUrl}${path}`,
        jar: jarFirst,
    })
    .then((data) => {
        const urlStr = data.body.match(/<input type="hidden" value="(.*?)" name="YII_CSRF_TOKEN"\/>/mi);
        const re = /<button type="button" class=".*?" data-task-id="(.*?)"/gm;
        const values = [];
        let value;
        while ((value = re.exec(data.body)) !== null) {
            values[values.length] = {
                id: value[1],
                token,
                csrf: urlStr[1],
            };
        }
        return values.slice(0, config.countTask);
    });
}

function fillLinkTask(values) {
    return new Promise((resolve, reject) => {
        async.mapSeries(values, (value, callback) => pr({
            url: `${config.firstUrl}tasks/do/${value.id}/`,
            followRedirect: false,
            jar: jarFirst,
        })
        .then((data) => {
            value.url = data.response.headers.location;
            return callback(null, value);
        })
        .catch((error) => {
            console.error(error);
            return callback(error);
        }), (error, values) => {
            if (error) {
                return reject(error);
            }
            return resolve(values);
        });
    });
}

module.exports = {
    pr,
    delay,
    validateVk,
    getItemData,
    doCheck,
    getListTask,
    fillLinkTask,
    jarFirst,
    jarSecond
};
