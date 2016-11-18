window.submitClicked = function () {
  var loginForm = document.loginForm;
  loginForm.action = loginForm.action + window.location.search;
  console.log(loginForm.action);
  loginForm.submit();
};

