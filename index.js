const request = require('request');
const async = require('async');

const jarFirst = request.jar();
const jarSecond = request.jar();

const firstUrl = 'http://bosslike.ru/';
const secondAuthUrl = 'https://oauth.vk.com';
const secondApiUrl = 'https://api.vk.com';
const secondApiVersion = '5.52';

const vars = ['SMO_LOGIN', 'SMO_PASS', 'VK_CLIENT_ID', 'VK_LOGIN', 'VK_PASS'];
for (const i in vars) {
    const key = vars[i];
    if (!process.env.hasOwnProperty(key)) {
        console.log("doesn't have enough environment variables", key);
        process.exit(1);
    }
}

const firstLogin = process.env.SMO_LOGIN;
const firstPass = process.env.SMO_PASS;
const clientID = process.env.VK_CLIENT_ID;
const secondLogin = process.env.VK_LOGIN;
const secondPass = process.env.VK_PASS;
const countCicle = process.env.COUNT || 2;

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

function doAuthSecond() {
    console.log('doAuthSecond');

    return pr({
        url: `${secondAuthUrl}/authorize?client_id=${clientID}&redirect_uri=${secondAuthUrl}/blank.html&display=mobile&scope=wall,groups&v=&response_type=token&v=${secondApiVersion}`,
        jar: jarSecond,
    })
    .then((data) => {
        let urlStr = data.body.match(/<form method="post" action="(.*?)">/mi);
        urlStr = urlStr[1];
        console.log(urlStr);

        const re = /<input type="hidden" name="(.*?)" value="(.*?)"\s?\/?>/gm;
        let value;
        const formData = {};
        while ((value = re.exec(data.body)) !== null) {
            formData[value[1]] = value[2];
        }
        formData.email = secondLogin;
        formData.pass = secondPass;

        return pr({
            url: urlStr,
            method: 'post',
            form: formData,
            jar: jarSecond,
        })
        .then((data) => {
            const urlStr = data.body.match(/<form method="post" action="(.*?)">/mi);
            if (urlStr && urlStr.length) {
                return pr({
                    url: urlStr[1],
                    jar: jarSecond,
                })
                .then(data => getAccessToken(data.response));
            }
            return getAccessToken(data.response);
        });
    });
}

function getAccessToken(response) {
    const href = response.request.href;
    const token = href.match(/access_token=(.*?)&/mi);
    if (token && token.length) {
        return token[1];
    } else {
        throw new Error('getting a token');
    }
}

function validateLikeVk(data, value) {
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

function doLikeVk(value) {
    console.log(value.url, 'doLikeVk');
    let [type, ownerId, itemId] = getItemData(value.url);

    return pr({
        url: `${secondApiUrl}/method/likes.add?type=${type}&item_id=${itemId}&owner_id=${ownerId}&access_token=${value.token}&v=${secondApiVersion}`,
        jar: jarSecond,
        json: true,
    })
    .then(data => validateLikeVk(data, value));
}

function doDislikeVk(value) {
    console.log(value.url, 'doDislikeVk');
    let [type, ownerId, itemId] = getItemData(value.url);

    return pr({
        url: `${secondApiUrl}/method/likes.delete?type=${type}&item_id=${itemId}&owner_id=${ownerId}&access_token=${value.token}&v=${secondApiVersion}`,
        jar: jarSecond,
        json: true,
    })
    .then(data => validateLikeVk(data, value));
}

function doSkip(value) {
    return pr({
        url: `${firstUrl}tasks/delete/`,
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
    const patters = id.match(/^http:\/\/(m\.)?vk\.com\/([a-z]+)(-?\d+)_(\d+)$/mi);
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

function getCsrfToken() {
    return pr({
        url: `${firstUrl}login/`,
        jar: jarFirst,
    })
    .then((data) => {
        const urlStr = data.body.match(/<input type="hidden" value="(.*?)" name="YII_CSRF_TOKEN"\/>/mi);
        return urlStr[1];
    });
}

function doAuthFirst(token) {
    return pr({
        url: `${firstUrl}login/`,
        method: 'post',
        form: {
            YII_CSRF_TOKEN: token,
            'UserLogin[login]': firstLogin,
            'UserLogin[password]': firstPass,
            submitLogin: 'Войти',
        },
        jar: jarFirst,
    })
    .then(() => token);
}

function doCheck(value) {
    return pr({
        url: `${firstUrl}tasks/check/`,
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

function getListTask(token) {
    return pr({
        url: `${firstUrl}tasks/vkontakte/like/`,
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
        return values;
    });
}

function fillLinkTask(values) {
    return new Promise((resolve, reject) => {
        async.mapSeries(values, (value, callback) => pr({
            url: `${firstUrl}tasks/do/${value.id}/`,
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

function doAction(values) {
    return new Promise((resolve, reject) => {
        async.mapSeries(values, (value, callback) => delay(500)
        .then(() => doLikeVk(value))
        .then(() => delay(1500))
        .then(() => doCheck(value))
        .then(() => doDislikeVk(value))
        .then(() => callback(null)), (error, values) => {
            if (error) {
                return reject(error);
            }
            return resolve(values);
        });
    });
}

getCsrfToken()
.then(firstToken => doAuthFirst(firstToken))
.then(() => doAuthSecond())
.then(secondToken => new Promise((resolve, reject) => {
    async.timesSeries(countCicle, (n, callback) => {
        getListTask(secondToken)
        .then(values => fillLinkTask(values))
        .then(values => doAction(values))
        .then(() => {
            console.log('loop');
            return callback(null);
        })
        .catch(error => callback(error));
    }, (error, values) => {
        if (error) {
            return reject(error);
        }
        return resolve(values);
    });
}))
.catch((error) => {
    console.error(error);
});
