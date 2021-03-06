import { Component, OnInit, ViewChild } from '@angular/core';
import { ConfigStoreService } from '../core/services';
import { ProjectManagerService } from '../core/services/project-manager.service';
import { FlatTreeControl, NestedTreeControl } from '@angular/cdk/tree';
import { MatTreeNestedDataSource } from '@angular/material/tree';
import { SelectionModel } from '@angular/cdk/collections';
import { MatDialog } from '@angular/material/dialog';
import { NewNodeDialogComponent } from '../shared/components/new-node-dialog/new-node-dialog.component';
import { KeyNode } from './models/key-node';
import { MatMenu, MatMenuTrigger } from '@angular/material';
import { Subject, of, } from 'rxjs';
import { map, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-project',
  templateUrl: './project.component.html',
  styleUrls: ['./project.component.scss']
})
export class ProjectComponent implements OnInit {

  nestedTreeControl: NestedTreeControl<any>;
  nestedDataSource: MatTreeNestedDataSource<any>;
  selectedNode: KeyNode;
  selectedNodeValues: string[] = [];

  /** The selection for checklist */
  checklistSelection = new SelectionModel<KeyNode>(true /* multiple */);

  searchKeyEvent: Subject<any> = new Subject();
  filterText: string = null;
  constructor(public configStoreService: ConfigStoreService,
    public projectManagerService: ProjectManagerService) { }

  ngOnInit() {

    this.nestedTreeControl = new NestedTreeControl<KeyNode>(this._getChildren);
    this.nestedDataSource = new MatTreeNestedDataSource();
    this.projectManagerService.filesData.subscribe(data => {
      // console.log(data);
      this.nestedDataSource.data = this.buildFileTree(this.getFirstFile, 0);
      this.nestedTreeControl.dataNodes = this.nestedDataSource.data;
      console.log(this.nestedTreeControl.dataNodes);
      
    })

    this.searchKeyEvent.pipe(
      map((e: any) => e.target.value.toLowerCase()),
      debounceTime(500),
      distinctUntilChanged(),
      switchMap((keyword: string) => {
        if (keyword && keyword.length > 2) {
          return of(keyword)
        } else {
          return of(null);
        }
      })).subscribe((text: string) => {
        this.filterChanged(text);
      })
  }

  get getFirstFile(): any {
    return this.projectManagerService.filesData.value
    [Object.keys(this.projectManagerService.filesData.value)[0]]
  }

  //#region #################### TREE VIEW ##################

  private _getChildren = (node: KeyNode) => node.children;

  private _getLevel = (node: KeyNode) => node.level;

  hasNestedChild = (_: number, nodeData: KeyNode) => nodeData.children;

  hasNoKey = (_: number, _nodeData: KeyNode) => _nodeData.key === null;

  /* Get the parent node of a node */
  private _getParentNode(node: KeyNode): KeyNode | null {
    const currentLevel = this._getLevel(node);

    if (currentLevel < 1) {
      return null;
    }
    console.log(node);
    // error due to nested
    const startIndex = this.nestedTreeControl.dataNodes.indexOf(node) - 1;

    for (let i = startIndex; i >= 0; i--) {
      const currentNode = this.nestedTreeControl.dataNodes[i];

      if (this._getLevel(currentNode) < currentLevel) {
        return currentNode;
      }
    }
    return null;
  }

  /**
* Build the file structure tree. The `value` is the Json object, or a sub-tree of a Json object.
* The return value is the list of `FileNode`.
*/
  private buildFileTree(obj: { [key: string]: any }, level: number, parentNode?: KeyNode): KeyNode[] {
    return Object.keys(obj).sort().reduce<KeyNode[]>((accumulator, key) => {
      const value = obj[key];
      const node = new KeyNode();
      node.key = key;
      node.level = level;
      node.parent = parentNode;
      if (parentNode) {
        node.value = parentNode.value + '.' + key;
      } else {
        node.value = key;
      }
      if (value != null) {
        if (typeof value === 'object') {
          node.children = this.buildFileTree(value, level + 1, node);
        } else {
          node.final = true;
        }
      }
      return accumulator.concat(node);
    }, []);
  }

  /** selection */


  /** Whether all the descendants of the node are selected. */
  descendantsAllSelected(node: KeyNode): boolean {
    const descendants = this.nestedTreeControl.getDescendants(node);
    const descAllSelected = descendants.every(child =>
      this.checklistSelection.isSelected(child)
    );
    return descAllSelected;
  }

  /** Whether part of the descendants are selected */
  descendantsPartiallySelected(node: KeyNode): boolean {
    const descendants = this.nestedTreeControl.getDescendants(node);
    const result = descendants.some(child => this.checklistSelection.isSelected(child));
    return result && !this.descendantsAllSelected(node);
  }

  /* Checks all the parents when a leaf node is selected/unselected */
  checkAllParentsSelection(node: KeyNode): void {
    let parent: KeyNode | null = this._getParentNode(node);
    while (parent) {
      this.checkRootNodeSelection(parent);
      parent = this._getParentNode(parent);
    }
  }

  /** Check root node checked state and change it accordingly */
  checkRootNodeSelection(node: KeyNode): void {
    const nodeSelected = this.checklistSelection.isSelected(node);
    const descendants = this.nestedTreeControl.getDescendants(node);
    const descAllSelected = descendants.every(child =>
      this.checklistSelection.isSelected(child)
    );
    if (nodeSelected && !descAllSelected) {
      this.checklistSelection.deselect(node);
    } else if (!nodeSelected && descAllSelected) {
      this.checklistSelection.select(node);
    }
  }

  /** Toggle a leaf to-do item selection. Check all the parents to see if they changed */
  leafItemSelectionToggle(node: KeyNode): void {
    this.checklistSelection.toggle(node);
    this.checkAllParentsSelection(node);
  }

  /** Toggle the to-do item selection. Select/deselect all the descendants node */
  itemSelectionToggle(node: KeyNode): void {
    this.checklistSelection.toggle(node);
    const descendants = this.nestedTreeControl.getDescendants(node);
    this.checklistSelection.isSelected(node)
      ? this.checklistSelection.select(...descendants)
      : this.checklistSelection.deselect(...descendants);

    // Force update for the parent
    descendants.every(child =>
      this.checklistSelection.isSelected(child)
    );
    this.checkAllParentsSelection(node);
  }

  /** fin selection */

  /** begin filter  */
  filterChanged(filterText: string) {
    // this.database.filter(filterText);
    this.filterText = filterText;
    this.rebuildTreeWithFilter(filterText);
    if (filterText) {
      this.nestedTreeControl.expandAll();
    } else {
      this.nestedTreeControl.collapseAll();
    }
  }

  rebuildTreeWithFilter(filterText: string) {
    if (filterText) {
      const filteredItems = this.nestedTreeControl.dataNodes.filter((node: KeyNode) => node.value.indexOf(filterText) === -1)
      filteredItems.map(n => {
        n.visible = false;
      });
    } else {
      this.nestedTreeControl.dataNodes.forEach(x => x.visible = true);
    }

    // this.nestedDataSource.data = this.buildFileTree(this.getFirstFile, 0);
  }

  //#endregion #################### TREE VIEW ##################

  // region ########## context menu #############
  @ViewChild(MatMenuTrigger, { static: false }) contextMenu: MatMenuTrigger;

  contextMenuPosition = { x: '0px', y: '0px' };

  onContextMenu(event: MouseEvent, item: KeyNode) {
    console.log(item);

    event.preventDefault();
    this.contextMenuPosition.x = event.clientX + 'px';
    this.contextMenuPosition.y = event.clientY + 'px';
    this.contextMenu.menuData = { 'item': item };
    this.contextMenu.menu.focusFirstItem('mouse');
    this.contextMenu.openMenu();
  }

  onContextMenuAction1(item: KeyNode) {
    console.log(item);
    item.editing = true;
    alert(`Click on Action 1 for ${item}`);
  }

  onContextMenuAction2(item: KeyNode) {
    alert(`Click on Action 2 for ${item}`);
  }
  //endregion context menu

  // called when we selct node
  // editLeaf(node: KeyNode) {
  //   this.selectedNode = node;
  //   if (!this.selectedNode.final) {
  //     if (!this.nestedTreeControl.isExpanded(node)) {
  //       this.nestedTreeControl.expandDescendants(node);
  //     } else {
  //       this.nestedTreeControl.collapse(node);
  //     }
  //   }
  //   this.selectedNodeValues = this.setSelectedNodeValues();
  // }

  // setSelectedNodeValues(): string[] {
  //   if (this.selectedNode) {
  //     const nodeValues: string[] = [];
  //     const fillArray = (n: KeyNode): void => {
  //       if (!n.children) {
  //         nodeValues.push(n.value);
  //       } else {
  //         for (let index = 0; index < n.children.length; index++) {
  //           const v = n.children[index];
  //           fillArray(v);
  //         }
  //       }
  //     }
  //     fillArray(this.selectedNode);
  //     return nodeValues;
  //   }
  //   return [];
  // }

  /** managing value (right block) */
  getValueByKey(value: any, key: string): string {
    try {
      return eval("value." + key);
    } catch (e) {
      return undefined;
    }
  }

  setValueByKey(value: any, key: string, event: any): void {
    eval("value." + key + ' = event;')
  }

  /** fin managing value (right block) */



}


