# bugbot

bugbot is a chat bot built on the [Hubot][hubot] framework. It was
initially generated by [generator-hubot][generator-hubot].

And then it was beat up side the head with an ugly stick.

The intention of this bot is to look in look at what is in buildkite and decide
if another relase is possible.  If so then return a pointer at what the delta
would be on beanstalk.  Given the unique configuration of buildkite and our
use of beanstalk this code might not be useful to anybody else.  But if it is
have fun with it.

If you do use this for some purpose then you will need the following environment
variables:

    HUBOT_HIPCHAT_JID= ...
    HUBOT_HIPCHAT_PASSWORD= ...
    HUBOT_LOG_LEVEL="debug"
    BUILDKITE_ACCESS_TOKEN= ...
    BUILDKITE_ORGANIZATION= ...
    BEANSTALK_DOMAIN= ...

You will also need a config module which contains

    var _config = [
      {
        'repo': '...',
        'rooms': [ ... ]
      },
      ...
    ];
