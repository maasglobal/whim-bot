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
  loginForm.action = loginForm.action + window.location.search;

  var oReq = new XMLHttpRequest();
  oReq.addEventListener("load", reqListener);
  oReq.open("GET", loginForm.action + '&code=' + loginForm.code.value);
  oReq.send();
  return false;
};

window.submitNumberClicked = function () {
  var loginForm = document.loginForm;
  loginForm.action = loginForm.action + window.location.search;
  console.log(loginForm.action);
 
  var oReq = new XMLHttpRequest();
  oReq.addEventListener("load", reqListener);
  oReq.open("GET", loginForm.action + '&phone=' + loginForm.phone.value);
  oReq.send();
  return false;
};
