const request = require("request")
const fs = require("fs")
const readline = require("readline");
const spawn = require("child_process").spawn
const FileCookieStore = require("tough-cookie-filestore")

const jarOne = request.jar(new FileCookieStore("jarOne.json"))
const jarSecond = request.jar()

const firstUrl = "https://smofast.com/"

const secondAuthUrl = "https://oauth.vk.com"
const secondApiUrl = "https://api.vk.com"
const secondApiVersion = "5.50"

function pr(options) {
  options = Object.assign({}, options, {
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.84 Safari/537.36"
    }
  })
  return new Promise(
    (resolve, reject) => {
      request(options,
        (error, response, body) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              response: response,
              body: body
            });
          }
        });
    });
}

function delay(ms) {
  return new Promise(function(resolve, reject) {
    setTimeout(resolve, ms);
  });
}

function doAuthSecond() {
  console.log("doAuthSecond")

  return pr({
      url: secondAuthUrl + "/authorize?client_id=" + clientID + "&redirect_uri=" + secondAuthUrl + "/blank.html&display=mobile&scope=wall,groups&v=&response_type=token&v=" + secondApiVersion,
      jar: jarSecond
    })
    .then((data) => {
      let urlStr = data.body.match(/<form method=\"post\" action=\"(.*?)\">/mi)
      urlStr = urlStr[1]
      console.log(urlStr);

      const re = /<input type=\"hidden\" name=\"(.*?)\" value=\"(.*?)\"\s?\/?>/gm
      let value
      let formData = {}
      while ((value = re.exec(data.body)) !== null) {
        formData[value[1]] = value[2]
      }
      formData["email"] = secondLogin
      formData["pass"] = secondPass

      return pr({
          url: urlStr,
          method: "post",
          form: formData,
          jar: jarSecond
        })
        .then((data) => {
          let urlStr = data.body.match(/<form method=\"post\" action=\"(.*?)\">/mi)
          if (urlStr && urlStr.length) {
            console.log(urlStr[1])
          }

          let href = data.response.request.href
          let token = href.match(/access_token=(.*?)&/mi)
          if (token && token.length) {
            return token[1]
          } else {
            throw new Error("getting a token")
          }
        })
    })
}

function doAuthOne(captchaUrl) {
  console.log("doAuthOne")

  return new Promise((resolve, reject) => {
      return request({
          url: captchaUrl,
          jar: jarOne
        })
        .on('end', (response) => {
          return resolve()
        })
        .on('error', (error) => {
          return reject(error)
        })
        .pipe(fs.createWriteStream("/tmp/captcha.png"))
    })
    .then(() => {
      setTimeout(() => spawn("open", ["/tmp/captcha.png"]), 2e3)
    })
    .then(() => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      })
      return rl.question("captcha? ", (captcha) => {
        return pr({
            url: firstUrl,
            method: "post",
            form: {
              login: firstLogin,
              pass: firstPass,
              captcha: captcha,
              remember: "on",
              connect: "Вход"
            },
            jar: jarOne
          })
          .then((data) => {
            error = /Ошибка/.test(data.body)
            if (error) {
              throw new Error()
            } else {
              return doStepSecond()
            }
          })
          .then(() => rl.close())
      })
    })
}

function doLikeVk(specilaId, token) {
  console.log("doLikeVk:", specilaId)

  let [
    type,
    ownerId,
    itemId
  ] = getItemData(specilaId)

  return pr({
    url: secondApiUrl + "/method/likes.add?type=" + type + "&item_id=" + itemId + "&owner_id=" + ownerId + "&access_token=" + token + "&v=" + secondApiVersion,
    jar: jarSecond,
    json: true
  })
}

function doDislikeVk(specilaId, token) {
  console.log("doDislikeVk:", specilaId)

  let [
    type,
    ownerId,
    itemId
  ] = getItemData(specilaId)

  return pr({
    url: secondApiUrl + "/method/likes.delete?type=" + type + "&item_id=" + itemId + "&owner_id=" + ownerId + "&access_token=" + token + "&v=" + secondApiVersion,
    jar: jarSecond,
    json: true
  })
}

function doAction(value) {
  console.log("doAction")

  let groupId
  let [
    pid,
    specilaId,
    token
  ] = [...value]

  return pr({
      url: firstUrl + "system/modules/vk_like/process.php",
      method: "post",
      form: {
        get: 1,
        url: specilaId,
        pid: pid
      },
      jar: jarOne
    })
    .then((data) => {
      return delay(5e3).then(_ => doLikeVk(specilaId, token))
    })
    .then((data) => {
      if (data.body.error && data.body.error.error_code === 100) {
        return pr({
            url: firstUrl + "system/modules/vk_like/process.php",
            method: "post",
            form: {
              step: "skip",
              sid: pid
            },
            jar: jarOne
          })
          .then(_ => {
            console.log(pid, "skip")
            throw new Error()
          })
      } else if (data.body.error) {
        console.log(pid, "captcha")
        throw new Error()
      } else {
        return
      }
    })
    .then((data) => {
      return pr({
        url: firstUrl + "system/modules/vk_like/process.php",
        method: "post",
        form: {
          id: pid
        },
        jar: jarOne
      })
    })
    .then((data) => {
      return delay(5e3).then(_ => doDislikeVk(specilaId, token))
    })
}

function doStepSecond(token) {
  console.log("doStepSecond")

  return pr({
      url: firstUrl + "p.php?p=vk_like",
      jar: jarOne
    })
    .then((data) => {
      const re = /ModulePopup\('(.*?)','(.*?)',.*\);/gm
      let values = []
      let value
      while ((value = re.exec(data.body)) !== null) {
        values[values.length] = [value[1], value[2], token]
      }
      return values
    })
}

function getItemData(id) {
  let patters = id.match(/^([a-z]+)\-?(\d+)_(\d+)$/mi)
  let [
    _,
    type,
    ownerId,
    itemId
  ] = [...patters]

  if (type === 'wall') {
    type = 'post'
  }
  return [
    type,
    ownerId,
    itemId
  ]
}

pr({
    url: firstUrl,
    jar: jarOne
  })
  .then(data => {
    let captchaUrl = data.body.match(/<img\s+src=\"(.*?)\"\s+alt=\"\"\/\>/mi)
    captchaUrl = captchaUrl && (firstUrl + captchaUrl[1])
    if (captchaUrl) {
      console.log("captcha url:", captchaUrl)
      return doAuthOne(captchaUrl)
    }
    return
  })
  .then(data => {
    return doAuthSecond()
  })
  .then(token => {
    return doStepSecond(token)
  })
  .then(values => {
    return values.forEach(doAction)
  })
  .catch(error => {
    console.error(error)
    return
  })