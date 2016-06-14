const request = require("request")
const fs = require("fs")
const readline = require("readline");
const spawn = require("child_process").spawn
const FileCookieStore = require("tough-cookie-filestore")

const jarOne = request.jar(new FileCookieStore("jarOne.json"))
const jarSecond = request.jar()

const firstUrl = "https://smofast.com/"
const firstLogin = ""
const firstPass = ""

const secondAuthUrl = "https://oauth.vk.com"
const secondApiUrl = "https://api.vk.com"
const secondApiVersion = "5.50"
const clientID = ""
const secondLogin = ""
const secondPass = ""

function pr(options) {
  options = Object.assign({}, options, {
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.84 Safari/537.36"
    }
  })
  return new Promise(
    function(resolve, reject) {
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
  return pr({
      url: captchaUrl,
      jar: jarOne
    })
    .then(fs.createWriteStream("/tmp/captcha.png"))
    .then(() => {
      setTimeout(() => spawn("open", ["/tmp/captcha.png"]), 2e3)
    })
    .then(() => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      })
      return rl.question("captcha? ", (captcha) => {
        rl.close()

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
      })
    })
}

function getGroupInfo(groupName) {
  console.log("info:", groupName)
  return pr({
    url: secondApiUrl + "/method/groups.getById?&group_id=" + groupName + "&fields=&v=" + secondApiVersion,
    jar: jarSecond,
    json: true
  })
}

function doJoinVk(groupId, token) {
  console.log("join:", groupId)
  return pr({
    url: secondApiUrl + "/method/groups.join?&group_id=" + groupId + "&access_token=" + token + "&v=" + secondApiVersion,
    jar: jarSecond,
    json: true
  })
}

function doLeaveVk(groupId, token) {
  console.log("leave:", groupId)
  return pr({
    url: secondApiUrl + "/method/groups.leave?&group_id=" + groupId + "&access_token=" + token + "&v=" + secondApiVersion,
    jar: jarSecond,
    json: true
  })
}

function doRepost(value) {
  let groupId

  let pid = value[0]
  let nameGroup = value[1]
  let token = value[2]

  return pr({
      url: firstUrl + "system/modules/vk/process.php",
      method: "post",
      form: {
        get: 1,
        url: nameGroup,
        pid: pid
      },
      jar: jarOne
    })
    .then((data) => {
      console.log(data.body, nameGroup, pid)
      return getGroupInfo(nameGroup)
    })
    .then((data) => {
      return delay(5e3)
        .then(() => {
          if (data.body && data.body.response && data.body.response.length) {
            groupId = data.body.response[0].id
            return doJoinVk(groupId, token)
          } else {
            console.log(data.body)
            throw new Error()
          }
        })
    })
    .then((data) => {
      return pr({
        url: firstUrl + "system/modules/vk/process.php",
        method: "post",
        form: {
          id: pid
        },
        jar: jarOne
      })
    })
    .then((data) => {
      console.log(data.body, pid)
      return delay(5e3)
        .then(doLeaveVk(groupId, token))
    })
}

function doStepSecond(token) {
  return pr({
      url: firstUrl + "p.php?p=vk",
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
  })
  .then(data => {
    return doAuthSecond()
  })
  .then(token => {
    return doStepSecond(token)
  })
  .then(values => {
    return Promise.all(values.map(doRepost))
  })
  .catch(error => {
    console.error(error)
    return
  })