# Ingenium Archive Service 

This repo contains the source code for the Ingenium Archive, it uses ArangoDB to maintain the structure of a procedure in a graph database. This provides a resful service to that database, in an API structure that is similiar to that of Ingenium Core.  All functionality can be found in /api/node_funcs.js

The server is written in NodeJS.

some development endpoints can be found at IPADDRESS:8010/docs

A more complete documentation with pretty colors can be found at IPADDRESS:8010/prettydoc

## Setup

This service is deployed as a Docker container. Do the following to build, run, and stop the containers.

### Prerequisites
#### Enviorment Variables
Configurations are set in 'config.js'. The configurations can be overridden by setting environment variable.
For Docker containers, set the environment variables.
The settings are typically set in docker-compose file.
```
ARANGODBURL=http://arangodb:8529
ARANGODBPASS=somepassword
```
### Starting the service
Make sure the project has been built using the above the step before running this step.
```
docker-compose up --build -d
```
You can now view the service in a browser on your host machine at "http://localhost:8010/prettydoc". This brings up the swagger-ui front-end, which you can use to further explore the API.

### Stopping the service
```
docker compose down
```

## Tests:
Interface and function tests are based on Python unittest framework. To run tests:
```
cd tests
virtualenv ve
source ve\bin\activate
pip install -r requirements.txt
python venues_test.py
python executions_test.py

```

## Miscellaneous:
If you want to run the server locally on your host machine rather than in a Docker container download node.js then, run:
```
npm start
``` 

It should be noted that youll still need to connect to some external Arangodb. npm start will only start the archive API not arangodb itself

## Contact
Chris Swan: Christopher.A.Swan@jpl.nasa.gov
Ingenium Development Team: ingenium-dev@jpl.nasa.gov

