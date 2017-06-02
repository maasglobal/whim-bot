# whim-bot

Built with Serverless >= 1.8, deploys to AWS directly. 

* Create a bot at [Bot Framework](https://botframework.com)
* Create a Facebook [Page and a Facebook app](https://developer.facebook.com)
* Configure your project by editing `serverless.yml`
* Configure your environment by creating `dev-env.yml` based on the sample given
* Set up [Serverless](https://serverless.com)

```
npm install
sls deploy --region eu-west-1
```

## Updating the persistent menu

```
curl -X POST -H "Content-Type: application/json" -d @persistent-menu.json "https://graph.facebook.com/v2.6/me/thread_settings?access_token=$FACEBOOK_PAGE_TOKEN"
```

## About this project

Note that this is a proof-of-concept, at best, at the moment. So treat it as such - code isn't well structured and the flow has some holes in it. But the point is to show what can be done with this setup in rather short amount of time.