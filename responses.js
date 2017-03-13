'use strict';

const BOT_FRONTEND_URL = process.env.BOT_FRONTEND_URL;
const LOGO_URL = process.env.BOT_LOGO_URL;

const factor1 = () => {
  return `<!DOCTYPE html>
  <html>
  <head>
    <title>Whim Login</title>
    <script src="scripts.js"></script>
    <link rel="stylesheet" type="text/css" href="style.css"></link>
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
  <body>
    <div>
      <img src="${LOGO_URL}"></img>
      <h3>Login to Whim</h3>
      <form name="loginForm" action="#" method="GET" onsubmit="return submitNumberClicked();" >
        <p>Please enter your phone number and click 'Login'</p>
        <div id="errors"></div>
        <input type="tel" name="phone">
        <input type="submit" value="Login">
      </form>
      <h5>What's this?</h5>
      <p>You need an account with <a href="https://whimapp.com">Whim</a> for this to work. 
        Please download the app and sign up before continuing.</p>
    </div>
  </body>
  </html>
`
}

module.exports.factor2 = () => {
  return `
  <!DOCTYPE html>
<html>
<head>
  <title>Whim Login</title>
  <script src="scripts.js"></script>
  <link rel="stylesheet" type="text/css" href="style.css"></link>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <div>
    <img src="${LOGO_URL}"></img>
    <form name="loginForm" action="#" method="GET" onsubmit="return submitCodeClicked();">
      <h3>Please enter code received to the given phone number</h3>
      <div id="errors"></div>
      <input type="number" inputmode="numeric" pattern="[0-9]*" name="code">
      <input type="submit" value="Login">
    </form>
  </div>
</body>
</html>
`
}

module.exports.scripts = () => {
  return `
  function reqListener () {
    var response = JSON.parse(this.responseText);
    response.body = JSON.parse(response.body);
    console.log(response);
    if (response.statusCode === 200) {
      window.location = response.body.url;
    } else {
      window.location = './index.html';
    }
  }

  window.submitCodeClicked = function () {
    var loginForm = document.loginForm;
    var val = loginForm.code.value;
    // sanitize the number
    val = val.trim();
    if (!val || val.length < 6 || !Number.isInteger(parseInt(val, 10))) {
      console.log('Error validating code');
      document.getElementById('errors').innerHTML = '<strong>Type a valid code from the SMS you got</strong>';
      return false;
    }    
    loginForm.action = loginForm.action + window.location.search + '&code=' + loginForm.code.value;
    window.location = '${BOT_FRONTEND_URL}/factor2' + window.location.search + '&code=' + loginForm.code.value;;
    
    return false;
  };

  window.submitNumberClicked = function () {
    var loginForm = document.loginForm;
    var val = loginForm.phone.value;
    // sanitize the phone number
    val = val.trim();
    val = val.replace('-', '');
    val = val.replace('.', '');
    val = val.replace(' ', '');
    if (val.length < 7 || !Number.isInteger(parseInt(val, 10)) || val.startsWith('0')) {
      console.log('Error validating phone number');
      document.getElementById('errors').innerHTML = 'Type a valid phone number with country code, as in +358555489787';
      return false;
    }
    window.location = '${BOT_FRONTEND_URL}/factor1' + window.location.search + '&phone=' + val;
    console.log('action is', loginForm.action);
  
    return false;
  };

    `
}

module.exports.css = () => {
  return `html,body {
      padding: 30px 30px;
      height:100%;
      width:100%;
      margin:auto;
      display: block;
    }
    div{
      margin: 0 auto; 
      width:300px;
    }
    img{
      margin: 0 auto; 
      width:300px;
    }
    form { padding: 7px; width: 100%; display: block; background: #FAFAFA; margin: 0 auto;}
    input {
      line-height: 25px;
      padding: 5px;
    }
    input[type=submit] {
      width: auto;
      padding: 9px 15px;
      background: #617798;
      border: 0;
      font-size: 14px;
      font-weight: bold;
      color: #FFFFFF;
      -moz-border-radius: 5px;
      -webkit-border-radius: 5px;
      cursor: pointer;
    }

  `  
}

module.exports.index = (event, context, callback) => {
  console.log('Static Content Event is', event);
  switch (event.path) {
    case '/factor2.html':
      return callback(null, { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: module.exports.factor2() });
    case '/style.css':
      return callback(null, { statusCode: 200, headers: { 'Content-Type': 'text/css' }, body: module.exports.css() });
    case '/scripts.js':
      return callback(null, { statusCode: 200, headers: { 'Content-Type': 'application/javascript' }, body: module.exports.scripts() });
    case '/index.html':
    default:
      return callback(null, { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: factor1() });
  }
}