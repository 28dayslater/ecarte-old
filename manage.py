#!/usr/bin/env python 
import os, sys
from os import path
from flask.ext.script import Manager, Server, Shell

#from smartcarte import app


if __name__ == '__main__':
    #sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
    from ecarte import app
    manager = Manager(app)
    manager.add_command("runserver", Server(
                        threaded = True,
                        use_debugger = True,
                        use_reloader = True,
                        port=8080,
                        host = '0.0.0.0'))
    manager.add_command("shell", Shell(use_ipython=True))
    manager.run()
