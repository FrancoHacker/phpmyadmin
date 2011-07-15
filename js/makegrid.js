(function ($) {
    $.grid = function(t) {
        // prepare the grid
        var g = {
            // constant
            minColWidth: 15,
            
            // variables, assigned with default value, changed later
            actionSpan: 5,
            colOrder: new Array(),      // array of column order
            colVisib: new Array(),      // array of column visibility
            tableCreateTime: null,      // table creation time, only available in "Browse tab"
            qtip: null,                 // qtip API
            reorderHint: '',            // string, hint for column reordering
            sortHint: '',               // string, hint for column sorting
            markHint: '',               // string, hint for column marking
            colVisibHint: '',           // string, hint for column visibility drop-down
            showReorderHint: false,
            showSortHint: false,
            showMarkHint: false,
            showColVisibHint: false,
            showAllColText: '',         // string, text for "show all" button under column visibility list
            visibleHeadersCount: 0,     // number of visible data headers
            
            // functions
            dragStartRsz: function(e, obj) {    // start column resize
                var n = $(this.cRsz).find('div').index(obj);
                this.colRsz = {
                    x0: e.pageX,
                    n: n,
                    obj: obj,
                    objLeft: $(obj).position().left,
                    objWidth: $(this.t).find('th.draggable:visible:eq(' + n + ') span').outerWidth()
                };
                $('body').css('cursor', 'col-resize');
                $('body').noSelect();
            },
            
            dragStartMove: function(e, obj) {   // start column move
                // prepare the cCpy and cPointer from the dragged column
                $(this.cCpy).text($(obj).text());
                var objPos = $(obj).position();
                $(this.cCpy).css({
                    top: objPos.top + 20,
                    left: objPos.left,
                    height: $(obj).height(),
                    width: $(obj).width()
                });
                $(this.cPointer).css({
                    top: objPos.top
                });
                
                // get the column index, zero-based
                var n = this.getHeaderIdx(obj);
                
                this.colMov = {
                    x0: e.pageX,
                    y0: e.pageY,
                    n: n,
                    newn: n,
                    obj: obj,
                    objTop: objPos.top,
                    objLeft: objPos.left
                };
                this.qtip.hide();
                $('body').css('cursor', 'move');
                $('body').noSelect();
            },
            
            dragMove: function(e) {
                if (this.colRsz) {
                    var dx = e.pageX - this.colRsz.x0;
                    if (this.colRsz.objWidth + dx > this.minColWidth)
                        $(this.colRsz.obj).css('left', this.colRsz.objLeft + dx + 'px');
                } else if (this.colMov) {
                    // dragged column animation
                    var dx = e.pageX - this.colMov.x0;
                    $(this.cCpy)
                        .css('left', this.colMov.objLeft + dx)
                        .show();
                    
                    // pointer animation
                    var hoveredCol = this.getHoveredCol(e);
                    if (hoveredCol) {
                        var newn = this.getHeaderIdx(hoveredCol);
                        this.colMov.newn = newn;
                        if (newn != this.colMov.n) {
                            // show the column pointer in the right place
                            var colPos = $(hoveredCol).position();
                            var newleft = newn < this.colMov.n ?
                                          colPos.left :
                                          colPos.left + $(hoveredCol).outerWidth();
                            $(this.cPointer)
                                .css({
                                    left: newleft,
                                    visibility: 'visible'
                                });
                        } else {
                            // no movement to other column, hide the column pointer
                            $(this.cPointer).css('visibility', 'hidden');
                        }
                    }
                }
            },
            
            dragEnd: function(e) {
                if (this.colRsz) {
                    var dx = e.pageX - this.colRsz.x0;
                    var nw = this.colRsz.objWidth + dx;
                    if (nw < this.minColWidth) {
                        nw = this.minColWidth;
                    }
                    var n = this.colRsz.n;
                    // do the resizing
                    this.resize(n, nw);
                    
                    $('body').css('cursor', 'default');
                    this.reposRsz();
                    this.reposDrop();
                    this.colRsz = false;
                } else if (this.colMov) {
                    // shift columns
                    if (this.colMov.newn != this.colMov.n) {
                        this.shiftCol(this.colMov.n, this.colMov.newn);
                        // assign new position
                        var objPos = $(this.colMov.obj).position();
                        this.colMov.objTop = objPos.top;
                        this.colMov.objLeft = objPos.left;
                        this.colMov.n = this.colMov.newn;
                        // send request to server to remember the column order
                        if (this.tableCreateTime) {
                            this.sendColPrefs();
                        }
                        this.refreshRestoreButton();
                    }
                    
                    // animate new column position
                    $(this.cCpy).stop(true, true)
                        .animate({
                            top: g.colMov.objTop,
                            left: g.colMov.objLeft
                        }, 'fast')
                        .fadeOut();
                    $(this.cPointer).css('visibility', 'hidden');

                    this.colMov = false;
                }
                $('body').css('cursor', 'default');
                $('body').noSelect(false);
            },
            
            /**
             * Resize column n to new width "nw"
             */
            resize: function(n, nw) {
                $(this.t).find('tr').each(function() {
                    $(this).find('th.draggable:visible:eq(' + n + ') span,' +
                                 'td:visible:eq(' + (g.actionSpan + n) + ') span')
                           .css('width', nw);
                });
            },
            
            /**
             * Reposition column resize bars.
             */
            reposRsz: function() {
                $(this.cRsz).find('div').hide();
                var $firstRowCols = $(this.t).find('tr:first th.draggable:visible');
                for (var n = 0; n < $firstRowCols.length; n++) {
                    $this = $($firstRowCols[n]);
                    $cb = $(g.cRsz).find('div:eq(' + n + ')');   // column border
                    $cb.css('left', $this.position().left + $this.outerWidth(true))
                       .show();
                }
                $(this.cRsz).css('height', $(this.t).height());
            },
            
            /**
             * Shift column from index oldn to newn.
             */
            shiftCol: function(oldn, newn) {
                $(this.t).find('tr').each(function() {
                    if (newn < oldn) {
                        $(this).find('th.draggable:eq(' + newn + '),' +
                                     'td:eq(' + (g.actionSpan + newn) + ')')
                               .before($(this).find('th.draggable:eq(' + oldn + '),' +
                                                    'td:eq(' + (g.actionSpan + oldn) + ')'));
                    } else {
                        $(this).find('th.draggable:eq(' + newn + '),' +
                                     'td:eq(' + (g.actionSpan + newn) + ')')
                               .after($(this).find('th.draggable:eq(' + oldn + '),' +
                                                   'td:eq(' + (g.actionSpan + oldn) + ')'));
                    }
                });
                // reposition the column resize bars
                this.reposRsz();
                    
                // adjust the column visibility list
                if (newn < oldn) {
                    $(g.cList).find('.lDiv div:eq(' + newn + ')')
                              .before($(g.cList).find('.lDiv div:eq(' + oldn + ')'));
                } else {
                    $(g.cList).find('.lDiv div:eq(' + newn + ')')
                              .after($(g.cList).find('.lDiv div:eq(' + oldn + ')'));
                }
                // adjust the colOrder
                var tmp = this.colOrder[oldn];
                this.colOrder.splice(oldn, 1);
                this.colOrder.splice(newn, 0, tmp);
                // adjust the colVisib
                var tmp = this.colVisib[oldn];
                this.colVisib.splice(oldn, 1);
                this.colVisib.splice(newn, 0, tmp);
            },
            
            /**
             * Find currently hovered table column's header (excluding actions column).
             * @return the hovered column's th object or undefined if no hovered column found.
             */
            getHoveredCol: function(e) {
                var hoveredCol;
                $headers = $(this.t).find('th.draggable:visible');
                $headers.each(function() {
                    var left = $(this).offset().left;
                    var right = left + $(this).outerWidth();
                    if (left <= e.pageX && e.pageX <= right) {
                        hoveredCol = this;
                    }
                });
                return hoveredCol;
            },
            
            /**
             * Get a zero-based index from a <th class="draggable"> tag in a table.
             */
            getHeaderIdx: function(obj) {
                return $(obj).parents('tr').find('th.draggable').index(obj);
            },
            
            /**
             * Reposition the table back to normal order.
             */
            restoreColOrder: function() {
                // use insertion sort, since we already have shiftCol function
                for (var i = 1; i < this.colOrder.length; i++) {
                    var x = this.colOrder[i];
                    var j = i - 1;
                    while (j >= 0 && x < this.colOrder[j]) {
                        j--;
                    }
                    if (j != i - 1) {
                        this.shiftCol(i, j + 1);
                    }
                }
                if (this.tableCreateTime) {
                    // send request to server to remember the column order
                    this.sendColPrefs();
                }
                this.refreshRestoreButton();
            },
            
            /**
             * Send column preferences (column order and visibility) to the server.
             */
            sendColPrefs: function() {
                $.post('sql.php', {
                    ajax_request: true,
                    db: window.parent.db,
                    table: window.parent.table,
                    token: window.parent.token,
                    server: window.parent.server,
                    set_col_prefs: true,
                    col_order: this.colOrder.toString(),
                    col_visib: this.colVisib.toString(),
                    table_create_time: this.tableCreateTime
                });
            },
            
            /**
             * Refresh restore button state.
             * Make restore button disabled if the table is similar with initial state.
             */
            refreshRestoreButton: function() {
                // check if table state is as initial state
                var isInitial = true;
                for (var i = 0; i < this.colOrder.length; i++) {
                    if (this.colOrder[i] != i) {
                        isInitial = false;
                        break;
                    }
                }
                // check if only one visible column left
                var isOneColumn = this.visibleHeadersCount == 1;
                // enable or disable restore button
                if (isInitial || isOneColumn) {
                    $('.restore_column').hide();
                } else {
                    $('.restore_column').show();
                }
            },
            
            /**
             * Update current hint using the boolean values (showReorderHint, showSortHint, etc.).
             * It will hide the hint if all the boolean values is false.
             */
            updateHint: function(e) {
                if (!this.colRsz && !this.colMov) {     // if not resizing or dragging
                    var text = '';
                    if (this.showReorderHint && this.reorderHint) {
                        text += this.reorderHint;
                    }
                    if (this.showSortHint && this.sortHint) {
                        text += text.length > 0 ? '<br />' : '';
                        text += this.sortHint;
                    }
                    if (this.showMarkHint && this.markHint &&
                        !this.showSortHint      // we do not show mark hint, when sort hint is shown
                    ) {
                        text += text.length > 0 ? '<br />' : '';
                        text += this.markHint;
                    }
                    if (this.showColVisibHint && this.colVisibHint) {
                        text += text.length > 0 ? '<br />' : '';
                        text += this.colVisibHint;
                    }
                    
                    // hide the hint if no text
                    this.qtip.disable(!text && e.type == 'mouseenter');
                    
                    this.qtip.updateContent(text, false);
                } else {
                    this.qtip.disable(true);
                }
            },
            
            /**
             * Toggle column's visibility.
             * After calling this function and it returns true, afterToggleCol() must be called.
             *
             * @return boolean True if the column is toggled successfully.
             */
            toggleCol: function(n) {
                if (this.colVisib[n]) {
                    // can hide if more than one column is visible
                    if (this.visibleHeadersCount > 1) {
                        $(this.t).find('tr').each(function() {
                            $(this).find('th.draggable:eq(' + n + '),' +
                                         'td:eq(' + (g.actionSpan + n) + ')')
                                   .hide();
                        });
                        this.colVisib[n] = 0;
                        $(this.cList).find('.lDiv div:eq(' + n + ') input').removeAttr('checked');
                    } else {
                        // cannot hide, force the checkbox to stay checked
                        $(this.cList).find('.lDiv div:eq(' + n + ') input').attr('checked', 'checked');
                        return false;
                    }
                } else {    // column n is not visible
                    $(this.t).find('tr').each(function() {
                        $(this).find('th.draggable:eq(' + n + '),' +
                                     'td:eq(' + (g.actionSpan + n) + ')')
                               .show();
                    });
                    this.colVisib[n] = 1;
                    $(this.cList).find('.lDiv div:eq(' + n + ') input').attr('checked', 'checked');
                }
                return true;
            },
            
            /**
             * This must be called after calling toggleCol() and the return value is true.
             *
             * This function is separated from toggleCol because, sometimes, we want to toggle
             * some columns together at one time and do one adjustment after it, e.g. in showAllColumns().
             */
            afterToggleCol: function() {
                // some adjustments after hiding column
                this.reposRsz();
                this.reposDrop();
                this.sendColPrefs();
                
                // check visible first row headers count
                this.visibleHeadersCount = $(this.t).find('tr:first th.draggable:visible').length;
                this.refreshRestoreButton();
            },
            
            /**
             * Show columns' visibility list.
             */
            showColList: function(obj) {
                // only show when not resizing or reordering
                if (!this.colRsz && !this.colMov) {
                    var pos = $(obj).position();
                    // check if the list position is too right
                    if (pos.left + $(this.cList).outerWidth(true) > $(document).width()) {
                        pos.left = $(document).width() - $(this.cList).outerWidth(true);
                    }
                    $(this.cList).css({
                            left: pos.left,
                            top: pos.top + $(obj).outerHeight(true)
                        })
                        .show();
                    $(obj).addClass('coldrop-hover');
                }
            },
            
            /**
             * Hide columns' visibility list.
             */
            hideColList: function() {
                $(this.cList).hide();
                $(g.cDrop).find('.coldrop-hover').removeClass('coldrop-hover');
            },
            
            /**
             * Reposition the column visibility drop-down arrow.
             */
            reposDrop: function() {
                $th = $(t).find('th:not(.draggable)');
                for (var i = 0; i < $th.length; i++) {
                    var $cd = $(this.cDrop).find('div:eq(' + i + ')');   // column drop-down arrow
                    var pos = $($th[i]).position();
                    $cd.css({
                            left: pos.left + $($th[i]).width() - $cd.width(),
                            top: pos.top
                        });
                }
            },
            
            /**
             * Show all hidden columns.
             */
            showAllColumns: function() {
                for (var i = 0; i < this.colVisib.length; i++) {
                    if (!this.colVisib[i]) {
                        this.toggleCol(i);
                    }
                }
                this.afterToggleCol();
            }
        }
        
        // wrap all data cells, except actions cell, with span
        $(t).find('th, td:not(:has(span))')
            .wrapInner('<span />');
        
        g.gDiv = document.createElement('div');     // create global div
        g.cRsz = document.createElement('div');     // column resizer
        g.cCpy = document.createElement('div');     // column copy, to store copy of dragged column header
        g.cPointer = document.createElement('div'); // column pointer, used when reordering column
        g.cDrop = document.createElement('div');    // column drop-down arrows
        g.cList = document.createElement('div');    // column visibility list
        
        // adjust g.cCpy
        g.cCpy.className = 'cCpy';
        $(g.cCpy).hide();
        
        // adjust g.cPoint
        g.cPointer.className = 'cPointer';
        $(g.cPointer).css('visibility', 'hidden');
        
        // adjust g.cDrop
        g.cDrop.className = 'cDrop';
        
        // adjust g.cList
        g.cList.className = 'cList';
        $(g.cList).hide();
        
        // chain table and grid together
        t.grid = g;
        g.t = t;
        
        // get first row data columns
        var $firstRowCols = $(t).find('tr:first th.draggable');
        
        // initialize g.visibleHeadersCount
        g.visibleHeadersCount = $firstRowCols.filter(':visible').length;
        
        // assign first column (actions) span
        if (! $(t).find('tr:first th:first').hasClass('draggable')) {  // action header exist
            g.actionSpan = $(t).find('tr:first th:first').prop('colspan');
        } else {
            g.actionSpan = 0;
        }
        
        // assign table create time
        // #table_create_time will only available if we are in "Browse" tab
        g.tableCreateTime = $('#table_create_time').val();
        
        // assign column reorder & column sort hint
        g.reorderHint = $('#col_order_hint').val();
        g.sortHint = $('#sort_hint').val();
        g.markHint = $('#col_mark_hint').val();
        g.colVisibHint = $('#col_visib_hint').val();
        g.showAllColText = $('#show_all_col_text').val();
        
        // initialize column order
        $col_order = $('#col_order');
        if ($col_order.length > 0) {
            g.colOrder = $col_order.val().split(',');
            for (var i = 0; i < g.colOrder.length; i++) {
                g.colOrder[i] = parseInt(g.colOrder[i]);
            }
        } else {
            g.colOrder = new Array();
            for (var i = 0; i < $firstRowCols.length; i++) {
                g.colOrder.push(i);
            }
        }
        
        // initialize column visibility
        $col_visib = $('#col_visib');
        if ($col_visib.length > 0) {
            g.colVisib = $col_visib.val().split(',');
            for (var i = 0; i < g.colVisib.length; i++) {
                g.colVisib[i] = parseInt(g.colVisib[i]);
            }
        } else {
            g.colVisib = new Array();
            for (var i = 0; i < $firstRowCols.length; i++) {
                g.colVisib.push(1);
            }
        }
        
        if ($firstRowCols.length > 1) {
            // create column drop-down arrow(s)
            $(t).find('th:not(.draggable)').each(function() {
                var cd = document.createElement('div'); // column drop-down arrow
                var pos = $(this).position();
                $(cd).addClass('coldrop')
                    .css({
                        left: pos.left + $(this).width() - $(cd).width(),
                        top: pos.top
                    })
                    .click(function() {
                        if (g.cList.style.display == 'none') {
                            g.showColList(this);
                        } else {
                            g.hideColList();
                        }
                    });
                $(g.cDrop).append(cd);
            });
            
            // add column visibility control
            g.cList.innerHTML = '<div class="lDiv"></div>';
            var $listDiv = $(g.cList).find('div');
            for (var i = 0; i < $firstRowCols.length; i++) {
                var currHeader = $firstRowCols[i];
                var listElmt = document.createElement('div');
                $(listElmt).text($(currHeader).text())
                    .prepend('<input type="checkbox" ' + (g.colVisib[i] ? 'checked="checked" ' : '') + '/>');
                $listDiv.append(listElmt);
                // add event on click
                $(listElmt).click(function() {
                    if ( g.toggleCol($(this).index()) ) {
                        g.afterToggleCol();
                    }
                });
            }
            // add "show all column" button
            var showAll = document.createElement('div');
            $(showAll).addClass('showAllColBtn')
                .text(g.showAllColText);
            $(g.cList).append(showAll);
            $(showAll).click(function() {
                g.showAllColumns();
            });
            // prepend "show all column" button at top if the list is too long
            if ($firstRowCols.length > 10) {
                var clone = showAll.cloneNode(true);
                $(g.cList).prepend(clone);
                $(clone).click(function() {
                    g.showAllColumns();
                });
            }
        }
        
        // create column borders
        $firstRowCols.each(function() {
            $this = $(this);
            var cb = document.createElement('div'); // column border
            $(cb).addClass('colborder')
                .mousedown(function(e) {
                    g.dragStartRsz(e, this);
                });
            $(g.cRsz).append(cb);
        });
        g.reposRsz();
        
        // bind event to update currently hovered qtip API
        $(t).find('th').mouseenter(function(e) {
            g.qtip = $(this).qtip('api');
        });
        
        // create qtip for each <th> with draggable class
        PMA_createqTip($(t).find('th.draggable'));
        
        // register events
        if (g.reorderHint) {    // make sure columns is reorderable
            $(t).find('th.draggable')
                .mousedown(function(e) {
                    if (g.visibleHeadersCount > 1) {
                        g.dragStartMove(e, this);
                    }
                })
                .mouseenter(function(e) {
                    if (g.visibleHeadersCount > 1) {
                        g.showReorderHint = true;
                        $(this).css('cursor', 'move');
                    } else {
                        $(this).css('cursor', 'inherit');
                    }
                    g.updateHint(e);
                })
                .mouseleave(function(e) {
                    g.showReorderHint = false;
                    g.updateHint(e);
                });
        }
        if ($firstRowCols.length > 1) {
            var $colVisibTh = $(t).find('th:not(.draggable)');
            
            PMA_createqTip($colVisibTh);
            $colVisibTh.mouseenter(function(e) {
                    g.showColVisibHint = true;
                    g.updateHint(e);
                })
                .mouseleave(function(e) {
                    g.showColVisibHint = false;
                    g.updateHint(e);
                });
        }
        $(t).find('th.draggable a')
            .attr('title', '')          // hide default tooltip for sorting
            .mouseenter(function(e) {
                g.showSortHint = true;
                g.updateHint(e);
            })
            .mouseleave(function(e) {
                g.showSortHint = false;
                g.updateHint(e);
            });
        $(t).find('th.marker')
            .mouseenter(function(e) {
                g.showMarkHint = true;
                g.updateHint(e);
            })
            .mouseleave(function(e) {
                g.showMarkHint = false;
                g.updateHint(e);
            });
        $(document).mousemove(function(e) {
            g.dragMove(e);
        });
        $(document).mouseup(function(e) {
            g.dragEnd(e);
        });
        $('.restore_column').click(function() {
            g.restoreColOrder();
        });
        $(t).find('td, th.draggable').mouseenter(function() {
            g.hideColList();
        });
        
        // add table class
        $(t).addClass('pma_table');
        
        // link all divs
        $(t).before(g.gDiv);
        $(g.gDiv).append(t);
        $(g.gDiv).prepend(g.cRsz);
        $(g.gDiv).append(g.cPointer);
        $(g.gDiv).append(g.cDrop);
        $(g.gDiv).append(g.cList);
        $(g.gDiv).append(g.cCpy);

        // some adjustment
        g.refreshRestoreButton();
        g.cRsz.className = 'cRsz';
        $(t).removeClass('data');
        $(g.gDiv).addClass('data');
        $(g.cRsz).css('height', $(t).height());
        $(t).find('th a').bind('dragstart', function() {
            return false;
        });
    };
    
    // document ready checking
    var docready = false;
    $(document).ready(function() {
        docready = true;
    });
    
    // Additional jQuery functions
    /**
     * Make resizable, reorderable grid.
     */
    $.fn.makegrid = function() {
        return this.each(function() {
            if (!docready) {
                var t = this;
                $(document).ready(function() {
                    $.grid(t);
                    t.grid.reposDrop();
                });
            } else {
                $.grid(this);
                this.grid.reposDrop();
            }
        });
    };
    /**
     * Refresh grid. This must be called after changing the grid's content.
     */
    $.fn.refreshgrid = function() {
        return this.each(function() {
            if (!docready) {
                var t = this;
                $(document).ready(function() {
                    if (t.grid) {
                        t.grid.reposRsz();
                        t.grid.reposDrop();
                    }
                });
            } else {
                if (this.grid) {
                    this.grid.reposRsz();
                    this.grid.reposDrop();
                }
            }
        });
    }
    
})(jQuery);

