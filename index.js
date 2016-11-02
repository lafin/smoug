const request = require("request")
const async = require("async")
const fs = require("fs")
const readline = require("readline");
const spawn = require("child_process").spawn
const FileCookieStore = require("tough-cookie-filestore")

const jarOne = request.jar(new FileCookieStore("jarOne.json"))
const jarSecond = request.jar()

const firstUrl = "https://smofast.com/"
const secondAuthUrl = "https://oauth.vk.com"
const secondApiUrl = "https://api.vk.com"
const secondApiVersion = "5.52"

const vars = ["SMO_LOGIN", "SMO_PASS", "VK_CLIENT_ID", "VK_LOGIN", "VK_PASS"]
for (let i in vars) {
  let key = vars[i]
  if (!process.env.hasOwnProperty(key)) {
    console.log("doesn't have enough environment variables", key)
    process.exit(1)
  }
}

const firstLogin = process.env.SMO_LOGIN
const firstPass = process.env.SMO_PASS
const clientID = process.env.VK_CLIENT_ID
const secondLogin = process.env.VK_LOGIN
const secondPass = process.env.VK_PASS
const countCicle = process.env.COUNT || 1

function pr(options) {
  options = Object.assign({}, options, {
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36"
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
    .then(data => {
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
        .then(data => {
          let urlStr = data.body.match(/<form method=\"post\" action=\"(.*?)\">/mi)
          if (urlStr && urlStr.length) {
            return pr({
                url: urlStr[1],
                jar: jarSecond
              })
              .then(data => {
                return getAccessToken(data.response)
              })
          } else {
            return getAccessToken(data.response)
          }
        })
    })
}

function getAccessToken(response) {
  let href = response.request.href
  let token = href.match(/access_token=(.*?)&/mi)
  if (token && token.length) {
    return token[1]
  } else {
    throw new Error("getting a token")
  }
}

function validateLikeVk(data, specilaId, pid) {
  if (data.body.error) {
    if (data.body.error.error_code === 100) {
      return doSkip(specilaId, pid)
    } else if (data.body.error.error_code === 14) {
      console.log(specilaId, "captcha")
      throw new Error()
    } else {
      console.log(specilaId, data.body.error.error_msg)
      throw new Error()
    }
  } else {
    return
  }
}

function doLikeVk(specilaId, token, pid) {
  console.log(specilaId, "doLikeVk")

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
    .then(data => {
      return validateLikeVk(data, specilaId, pid)
    })
}

function doDislikeVk(specilaId, token, pid) {
  console.log(specilaId, "doDislikeVk")

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
    .then(data => {
      return validateLikeVk(data, specilaId, pid)
    })
}

function doSkip(specilaId, pid) {
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
      console.log(specilaId, "skip")
      return
    })
}

function doAction(value, done) {
  let groupId
  let [
    pid,
    specilaId,
    token
  ] = [...value]

  console.log("\n" + specilaId, "doAction")

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
    .then(_ => doLikeVk(specilaId, token, pid))
    .then(_ => {
      let attempt = 0
      return new Promise((resolve, reject) => {
        let timer = setInterval(_ => {
          pr({
              url: firstUrl + "system/modules/vk_like/process.php",
              method: "post",
              form: {
                id: pid
              },
              jar: jarOne
            })
            .then(data => {
              if (attempt === 3) {
                console.log(specilaId, "attempt over")
                clearInterval(timer)
                return doSkip(specilaId, pid)
                  .then(_ => doDislikeVk(specilaId, token, pid))
                  .then(resolve)
              }
              if (data.body === "1") {
                clearInterval(timer)
                return delay(1e3)
                  .then(_ => doDislikeVk(specilaId, token, pid))
                  .then(resolve)
              }
              attempt++
              console.log(specilaId, "try again")
              return
            })
        }, 3e3)
      })
    })
    .then(_ => done(null))
    .catch(_ => done(null))
}

function doStepSecond(token) {
  console.log("\n>>> doStepSecond")

  return pr({
      url: firstUrl + "p.php?p=vk_like",
      jar: jarOne
    })
    .then(data => {
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
  let patters = id.match(/^([a-z]+)(\-?\d+)_(\d+)$/mi)
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
  .then(_ => {
    return doAuthSecond()
  })
  .then(token => {
    return new Promise((resolve, reject) => {
      async.timesSeries(countCicle, (n, next) => {
        doStepSecond(token)
          .then(values => {
            return new Promise((resolve, reject) => {
              async.mapSeries(values, (value, callback) => {
                return doAction(value, callback)
              }, resolve)
            })
          })
          .then(_ => {
            next()
          })
      }, resolve)
    })
  })
  .catch(error => {
    console.error(error)
    return
  })