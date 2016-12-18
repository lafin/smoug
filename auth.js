const base = require('./base');
const config = require('./config');

function doAuthSecond() {
    console.log('doAuthSecond');

    return base.pr({
        url: `${config.secondAuthUrl}/authorize?client_id=${config.clientID}&redirect_uri=${config.secondAuthUrl}/blank.html&display=mobile&scope=wall,groups,friends&v=&response_type=token&v=${config.secondApiVersion}`,
        jar: base.jarSecond,
    })
    .then((data) => {
        let urlStr = data.body.match(/<form method="post" action="(.*?)">/mi);
        urlStr = urlStr[1];

        const re = /<input type="hidden" name="(.*?)" value="(.*?)"\s?\/?>/gm;
        let value;
        const formData = {};
        while ((value = re.exec(data.body)) !== null) {
            formData[value[1]] = value[2];
        }
        formData.email = config.secondLogin;
        formData.pass = config.secondPass;

        return base.pr({
            url: urlStr,
            method: 'post',
            form: formData,
            jar: base.jarSecond,
        })
        .then((data) => {
            const urlStr = data.body.match(/<form method="post" action="(.*?)">/mi);
            if (urlStr && urlStr.length) {
                return base.pr({
                    url: urlStr[1],
                    jar: base.jarSecond,
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

function getCsrfToken() {
    return base.pr({
        url: `${config.firstUrl}login/`,
        jar: base.jarFirst,
    })
    .then((data) => {
        const urlStr = data.body.match(/<input type="hidden" value="(.*?)" name="YII_CSRF_TOKEN"\/>/mi);
        return urlStr[1];
    });
}

function doAuthFirst(token) {
    console.log('doAuthFirst', token);

    return base.pr({
        url: `${config.firstUrl}login/`,
        method: 'post',
        form: {
            YII_CSRF_TOKEN: token,
            'UserLogin[login]': config.firstLogin,
            'UserLogin[password]': config.firstPass,
            submitLogin: 'Войти',
        },
        jar: base.jarFirst,
    })
    .then(() => token);
}

module.exports = {
    doAuthFirst,
    doAuthSecond,
    getCsrfToken
};
