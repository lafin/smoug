const request = require("request")
const fs = require("fs")
const readline = require("readline");
const spawn = require("child_process").spawn
const FileCookieStore = require("tough-cookie-filestore")

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})
const url = "https://smo.com/"
const smojar = request.jar(new FileCookieStore("smojar.json"))
const vkjar = request.jar()

const AuthURL = "https://oauth.vk.com"
const APIURL = "https://api.vk.com"
const APIVersion = "5.50"




const doAuthVk = (callback) => {
  let options = {
    url: AuthURL + "/authorize?client_id=" + clientID + "&redirect_uri=https://oauth.vk.com/blank.html&display=mobile&scope=wall,groups&v=&response_type=token&v=" + APIVersion,
    jar: vkjar
  }
  return request(options, (error, response, body) => {
    let urlStr = body.match(/<form method=\"post\" action=\"(.*?)\">/mi)
    urlStr = urlStr[1]
    console.log(urlStr);

    const re = /<input type=\"hidden\" name=\"(.*?)\" value=\"(.*?)\"\s?\/?>/gm
    let value
    let formData = {}
    while ((value = re.exec(body)) !== null) {
      formData[value[1]] = value[2]
    }
    formData["email"] = email
    formData["pass"] = pass

    options = {
      url: urlStr,
      method: "post",
      form: formData,
      jar: vkjar
    }
    return request(options, (error, response, body) => {
      let href = response.request.href
      let token = href.match(/access_token=(.*?)&/mi)
      return callback(token[1])
    })
  })
}

const doAuth = (captchaUrl) => {
  request({
    url: captchaUrl,
    jar: smojar
  }).pipe(fs.createWriteStream("/tmp/captcha.png"))
  setTimeout(() => spawn("open", ["/tmp/captcha.png"]), 2e3)

  return rl.question("captcha? ", (answer) => {
    let captcha = answer
    rl.close();

    options = {
      url: url,
      method: "post",
      form: {
        login: smoLogin,
        pass: smoPass,
        captcha: captcha,
        remember: "on",
        connect: "Вход"
      },
      jar: smojar
    }

    return request(options, (error, response, body) => {
      error = /Ошибка/.test(body)
      if (!error) {
        return getTasks()
      }
    })
  })
}

const getGroupInfo = (groupName, callback) => {
  let options = {
    url: APIURL + "/method/groups.getById?&group_id=" + groupName + "&fields=&v=" + APIVersion,
    jar: vkjar,
    json: true
  }
  return request(options, (error, response, body) => {
    return callback(body)
  })
}

const doJoinVk = (groupID, token, callback) => {
  let options = {
    url: APIURL + "/method/groups.join?&group_id=" + groupID + "&access_token=" + token + "&v=" + APIVersion,
    jar: vkjar,
    json: true
  }
  console.log("join:", groupID)
  return request(options, (error, response, body) => {
    return callback(body)
  })
}

const doLeaveVk = (groupID, token, callback) => {
  let options = {
    url: APIURL + "/method/groups.leave?&group_id=" + groupID + "&access_token=" + token + "&v=" + APIVersion,
    jar: vkjar,
    json: true
  }
  console.log("leave:", groupID)
  return request(options, (error, response, body) => {
    return callback(body)
  })
}

const doRepost = (idGroup, nameGroup, token) => {
  options = {
    url: url + "system/modules/vk/process.php",
    method: "post",
    form: {
      get: 1,
      url: nameGroup,
      pid: idGroup
    },
    jar: smojar
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

const getTasks = () => {
  doAuthVk(token => {
    if (token) {
      options = {
        url: url + "p.php?p=vk",
        jar: smojar
      }
      return request(options, (error, response, body) => {
        const re = /ModulePopup\('(.*?)','(.*?)',.*\);/gm
        let value
        while ((value = re.exec(body)) !== null) {
          doRepost(value[1], value[2], token)
        }
      })
    } else {
      console.log("Doesn't token")
    }
  })
}

let options = {
  url: url,
  jar: smojar
}
return request(options, (error, response, body) => {
  let captchaUrl = body.match(/<img\s+src=\"(.*?)\"\s+alt=\"\"\/\>/mi)
  captchaUrl = captchaUrl && (url + captchaUrl[1])
  if (captchaUrl) {
    console.log("captcha url:", captchaUrl)
    return doAuth(captchaUrl)
  } else {
    return getTasks()
  }
})