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
          let href = data.response.request.href
          let token = href.match(/access_token=(.*?)&/mi)
          if (token && token.length) {
            return token[1]
          } else {
            throw new Error("getting a token")
          }
        })
        .catch(error => {
          console.log("error", error)
        })
    })
    .catch(error => {
      console.log("error", error)
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
      return rl.question("captcha? ", (answer) => {
        let captcha = answer
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
          .catch(error => {
            console.log("error", error)
          })
      })
    })
    .catch(error => {
      console.log("error", error)
    })
}

function getGroupInfo(groupName, callback) {
  let options = {
    url: secondApiUrl + "/method/groups.getById?&group_id=" + groupName + "&fields=&v=" + secondApiVersion,
    jar: jarSecond,
    json: true
  }
  return request(options, (error, response, body) => {
    return callback(body)
  })
}

function doJoinVk(groupID, token, callback) {
  let options = {
    url: secondApiUrl + "/method/groups.join?&group_id=" + groupID + "&access_token=" + token + "&v=" + secondApiVersion,
    jar: jarSecond,
    json: true
  }
  console.log("join:", groupID)
  return request(options, (error, response, body) => {
    return callback(body)
  })
}

function doLeaveVk(groupID, token, callback) {
  let options = {
    url: secondApiUrl + "/method/groups.leave?&group_id=" + groupID + "&access_token=" + token + "&v=" + secondApiVersion,
    jar: jarSecond,
    json: true
  }
  console.log("leave:", groupID)
  return request(options, (error, response, body) => {
    return callback(body)
  })
}

function doRepost(idGroup, nameGroup, token) {
  options = {
    url: firstUrl + "system/modules/vk/process.php",
    method: "post",
    form: {
      get: 1,
      url: nameGroup,
      pid: idGroup
    },
    jar: jarOne
  }

  return request(options, (error, response, body) => {
    console.log('step 1:', body)

    setTimeout(() => {
      getGroupInfo(nameGroup, body => {
        if (body && body.response && body.response.length) {
          let groupID = body.response[0].id
          doJoinVk(groupID, token, body => {
            console.log(body)

            setTimeout(() => {
              options.form = {
                id: idGroup
              }
              return request(options, (error, response, body) => {
                console.log('step 2:', body)

                doLeaveVk(groupID, token, body => {
                  console.log(body)
                })
              })
            }, 10e3)
          })
        }
      })
    }, 1e3)
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
        values = values.concat([value[1], value[2], token]);
      }
      return values
    })
    .catch(error => {
      console.log("error", error)
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
    console.log(values)
  })
  .catch(error => {
    console.log("error", error)
  })