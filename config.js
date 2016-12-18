module.exports = {
    firstUrl: 'http://bosslike.ru/',
    secondAuthUrl: 'https://oauth.vk.com',
    secondApiUrl: 'https://api.vk.com',
    secondApiVersion: '5.52',
    firstLogin: process.env.SMO_LOGIN,
    firstPass: process.env.SMO_PASS,
    clientID: process.env.VK_CLIENT_ID,
    secondLogin: process.env.VK_LOGIN,
    secondPass: process.env.VK_PASS,
    countCicle: process.env.COUNT_CICLE || 1,
    countTask: process.env.COUNT_TASK || 5
};
