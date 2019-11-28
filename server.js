var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
server.listen(3000);
app.use(express.static(__dirname + '/Views'));

//function called lobby storing players,board,turns,updating the game (sync),clicking of discs , hover , unhover, 
//x y coordinates including error checking for clicks using x y
// win cases including directions (vertical , horizontal or diagonal line as specified)
//event handlers
function Lobby(Players) {
    //static variables
    this.Columns = 9;
    this.Rows = 6;
    this.End = false;
    this.Turn = 1;
    this.Players = Players;
    this.Game = [];
    //for loop for columns(9) and rows(6)
    for (var x = 0; x < 9; x++) {
        for (var y = 0; y < 6; y++) {
            this.Game.push(new Case(x, y, 0));
        }
    }
    //sets the static variable to players from the client side (index.html) "go" method (function) sets id and name
    this.Players.forEach(function(p) {
        Players.forEach(function(pName) {
            if (p != pName)
                p.emit('go', {
                    ID: p.ID,
                    Name: pName.Name
                });
        });
    });
    //sends message to the client
    this.EmitToOtherClient = function(_client, message, data) {
        this.Players.forEach(function(p) {
            if (p != _client)
                p.emit(message, data);
        });
    }
    
    this.getCaseClick = function(x) {
        Count = this.Game.filter(function(_c) {
            return _c.X === x && _c.Clicker === 0
        }).length;
        return this.CaseXY(x, Count - 1);
    }

    this.CaseXY = function(x, y) {
        for (var i = 0; i < this.Game.length; i++) {
            if (this.Game[i].X === x && this.Game[i].Y === y) {
                return this.Game[i];
            }
        }
        return null;
    }
    //updates game 
    //checks if player has completed their turn or won the game
    this.UpdateGame = function(_case, ID) {
        if (!this.End) {
            _case.Clicker = this.Turn;
            this.EmitPlayers('getClick', _case);

            if (this.Turn < this.Players.length)
                this.Turn++;
            else
                this.Turn = 1;

            this.TestWin(_case);
        }
    }

    this.EmitPlayers = function(message, data) {
        this.Players.forEach(function(p) {
            if (p != null) {
                p.emit(message, data);
            }
        });
    }

    this.Click = function(client, _caseClicked) {
        var _case = this.getCaseClick(_caseClicked.X);
        if (this.Turn === client.ID && _case != null)
            this.UpdateGame(_case, client.ID);
        else if (!this.End)
            client.emit('errorClick', _caseClicked);
    }

    this.Hover = function(client, _case) {
        if (this.Turn === client.ID && !this.End)
            this.EmitPlayers('getHover', {
                Case: this.getCaseClick(_case.X),
                Clicker: client.ID
            });
    }

    this.UnHover = function(client, _case) {
        if (this.Turn === client.ID)
            this.EmitPlayers('getUnHover', this.getCaseClick(_case.X));
    }
    //updates the opponent name to the client
    this.UpdateNames = function(client) {
        this.EmitToOtherClient(client, 'yourOpponent', client.Name);
    }
    //ends game 
    this.EndGame = function() {
        if(!this.End) {
            this.EmitPlayers('leave');
            this.End = true;
        }
    }
    //win function to check the winning methods ( win logic)
    this.TestWin = function(_case) {
        var Directions = [
            this.Game.filter(function(a) {
                return a.X == _case.X
            }),
            this.Game.filter(function(a) {
                return a.Y == _case.Y
            }),
            this.Game.filter(function(a) {
                return a.X - _case.X == a.Y - _case.Y
            }),
            this.Game.filter(function(a) {
                return -(a.X - _case.X) == a.Y - _case.Y
            })
        ];
        //for loop checking the direction and if 5 in a row ( as specified) then its a win
        for (var i = 0; i < Directions.length; i++) {
            var lWin = [];
            for (var j = 0; j < Directions[i].length; j++) {
                if (Directions[i][j].Clicker === _case.Clicker) {
                    lWin.push(Directions[i][j]);
                    if (lWin.length >= 5) {
                        this.Players.forEach(function(p) {
                            p.emit('win', {
                                Status: _case.Clicker == p.ID ? 'win' : 'loose',
                                CasesWin: lWin
                            });
                        });
                        this.End = true;
                        break;
                    }
                } else lWin = [];
            }
        }

        if (this.Game.filter(function(a) {
                return a.Clicker > 0
            }).length >= this.Game.length) {
            this.End = true;
            this.EmitPlayers('win', 0);
        }
    }
}

function Case(X, Y, Clicker) {
    this.X = X;
    this.Y = Y;
    this.Clicker = Clicker;
}

//clients array(users) 
//lobby array
//on connection event handler to wait for 2 players (connection)
var lClients = [];
var lLobby = [];

io.on('connection', function(client) {
    client.on('search', function(name) {
        if (lClients.indexOf(client) < 0) {
            lClients.push(client);
            client.Name = name;
            client.ID = lClients.length;
            client.LobbyID = null;
            if (lClients.length >= 2) {
                lClients.forEach(function(_c) { _c.LobbyID = lLobby.length; });
                lLobby.push(new Lobby(lClients));
                lClients = [];
            } else {
                client.emit('wait');
            }
        }
    });

    //user click event handler
    client.on('click', function(data) {
        if(client.LobbyID != null)
            lLobby[client.LobbyID].Click(client, data);
    });
    //user name update event handler
    client.on('nameUpdate', function(data) {
        client.Name = data;
        if(client.LobbyID != null)
            lLobby[client.LobbyID].UpdateNames(client);
    });
    //user hover event handler
    client.on('hover', function(data) {
        if(client.LobbyID != null)
            lLobby[client.LobbyID].Hover(client, data);
    });
    //user unhover (click away) event handler
    client.on('unhover', function(data) {
        if(client.LobbyID != null)
            lLobby[client.LobbyID].UnHover(client, data);
    });
    //disconnect the user event handler
    client.on('disconnectPlayer', function() {
        Leave();
    });
    //user disconnet event handler (Javascript splice method to modify array by removing element)
    client.on('disconnect', function() {
        Leave();

        lClients.forEach(function(_c) {
            if (_c === client)
                lClients.splice(client, 1);
        });
    });
    //function method when user leaves to end the game
    function Leave() {
        if(client.LobbyID != null)
            lLobby[client.LobbyID].EndGame();
    }
});
