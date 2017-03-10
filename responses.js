'use strict';

const factor1 = () => {
  return `<!DOCTYPE html>
  <html>
  <head>
    <title>Whim Login</title>
    <script src="scripts.js"></script>
  </head>
  <body>
    <img src="http://whimapp.com/wp-content/uploads/2017/03/whim.jpg"></img>
    <h1>Login to Whim</h1>
    <form name="loginForm" action="#" method="GET">
      <h2>Please enter your phone number:</h2>
      <input type="tel" name="phone">
      <input type="button" value="Login" onclick="submitNumberClicked()">
    </form>
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
</head>
<body>
  <img src="http://whimapp.com/wp-content/uploads/2017/03/whim.jpg"></img>
  <h1>Login to Whim</h1>
  <form name="loginForm" action="#" method="GET">
    <h2>Please enter code received to given phone number:</h2>
    <input type="number" inputmode="numeric" pattern="[0-9]*" name="code">
    <input type="button" value="Login" onclick="submitCodeClicked()">
  </form>
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
    loginForm.action = loginForm.action + window.location.search + '&code=' + loginForm.code.value;
    window.location = 'https://1gq96x3sg7.execute-api.eu-west-1.amazonaws.com/dev/factor2' + window.location.search + '&code=' + loginForm.code.value;;
  
    return false;
  };

  window.submitNumberClicked = function () {
    var loginForm = document.loginForm;
    window.location = 'https://1gq96x3sg7.execute-api.eu-west-1.amazonaws.com/dev/factor1' + window.location.search + '&phone=' + loginForm.phone.value;;
    console.log('action is', loginForm.action);
  
    return false;
  };

    `
}

module.exports.index = (event, context, callback) => {
  
  //console.log('Event is', event);
  switch (event.path) {
    case '/factor2.html':
      return callback(null, { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: module.exports.factor2() });
    case '/scripts.js':
      return callback(null, { statusCode: 200, headers: { 'Content-Type': 'application/javascript' }, body: module.exports.scripts() });
    case '/index.html':
    default:
      return callback(null, { statusCode: 200, headers: { 'Content-Type': 'text/html' }, body: factor1() });
  }
}