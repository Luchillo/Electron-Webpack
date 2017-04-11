import {
  Component,
  ViewChild,
  OnDestroy,
  AfterViewInit,
  ViewEncapsulation,
} from '@angular/core';

import { FormGroup, FormBuilder, Validators } from '@angular/forms';

import { Store } from '@ngrx/store';

import { AutoComplete, ConfirmationService } from "primeng/primeng";
import { Observable, Subject, Subscription } from 'rxjs';

import { v1 as uuidV1 } from 'uuid';

import { CustomTaskListsValidators } from ".";

@Component({
  selector: 'task-lists',
  host: {
    id: 'task-lists-panel',
  },
  styleUrls: [ './task-lists.component.scss' ],
  templateUrl: './task-lists.component.html',
  // encapsulation: ViewEncapsulation.None,
})
export class TaskListsComponent implements AfterViewInit, OnDestroy {
  @ViewChild('taskScheduleListAutocomplete') private taskScheduleListAutocomplete: AutoComplete;

  private taskSchedules$: Subscription;
  private selectedTaskSchedule$: Subscription;
  private taskScheduleDialogState$: Subscription;

  public selectedTaskScheduleId = "";

  public taskScheduleDialogState: DialogState = { show: false, type: 'NEW' };

  public scheduleLists: Observable<ScheduleList[]>;
  public taskSchedules: TaskSchedule[] = [];

  // NewListDialog
  public taskScheduleForm: FormGroup;

  constructor(
    private confirDialogService: ConfirmationService,
    private store: Store<RXState>,
    private fb: FormBuilder,
  ) {
    this.taskScheduleForm = this.fb.group({
      id: ['', Validators.required],
      name: ['', Validators.required],
      scheduleList: [null, [Validators.required, CustomTaskListsValidators.ScheduleListDropdownValidator]],
      active: [true, Validators.required],
      useDateRange: [true, Validators.required],
      start: [new Date()],
      end: [new Date()],

      second: ['*'],
      minute: ['*', Validators.required],
      hour: ['*', Validators.required],
      dayOfMonth: ['*', Validators.required],
      month: ['*', Validators.required],
      dayOfWeek: ['*', Validators.required],
    });
    global['taskScheduleDialogForm'] = this.taskScheduleForm;

    this.scheduleLists = this.store
      .select<ScheduleList[]>('scheduleLists')
      .map((scheduleLists) => {
        return scheduleLists.filter((scheduleList) => scheduleList.id != '')
      })

    this.taskSchedules$ = Observable.combineLatest(
      this.store.select<TaskSchedule[]>('taskSchedules'),
      this.store.select<ListsState>('listsState'),
      (taskSchedules, { selectedScheduleList }) => {
        return taskSchedules.filter((taskSchedule) => {
          return selectedScheduleList == '' ||
            taskSchedule.id == '' ||
            taskSchedule.scheduleListId == selectedScheduleList
        })
      })
      .subscribe((taskSchedules) => {
        this.taskSchedules = taskSchedules
      });

    this.selectedTaskSchedule$ = this.store.select<ListsState>('listsState')
      .subscribe(({ selectedTaskScedule }) => {
        this.selectedTaskScheduleId = selectedTaskScedule;
      });
  }

  public ngAfterViewInit() {
    this.taskScheduleDialogState$ = this.store
      .select<DialogState>('taskScheduleDialogState')
      .subscribe((taskScheduleDialogState) => {
        this.taskScheduleDialogState = taskScheduleDialogState
      });
  }

  ngOnDestroy() {
    this.taskSchedules$ && this.taskSchedules$.unsubscribe();
    this.selectedTaskSchedule$ && this.selectedTaskSchedule$.unsubscribe();
    this.taskScheduleDialogState$ && this.taskScheduleDialogState$.unsubscribe();
  }

  public setSelectedTaskSchedule(taskSchedule: TaskSchedule) {
    console.log('SetSelected: ', taskSchedule);
    this.store.dispatch({
      type: 'SHOW_TASK_SCHEDULE',
      payload: taskSchedule.id,
    });
  }

  public toogleTaskScheduleDialog(isShow: boolean) {
    this.taskScheduleForm.reset({
      id: uuidV1(),
      scheduleList: null,
      name: '',
      active: true,
      useDateRange: false,
    })
    this.store.dispatch({
      type: isShow ? 'SHOW_TASK_SCHEDULE_DIALOG' : 'HIDE_TASK_SCHEDULE_DIALOG',
      payload: this.taskScheduleDialogState.type,
    })
  }
  public openTaskScheduleDialog(type: string) {
    let selectedTaskScedule
    switch (type) {
      case 'UPDATE':
        if (this.selectedTaskScheduleId === '') return;
        // Extract scheduleListId of selectedTaskSchedule
        let { scheduleListId, ...selectedTaskSchedule} = this.taskSchedules
          .find((taskList) => taskList.id === this.selectedTaskScheduleId)

        this.store
          .select<ScheduleList[]>('scheduleLists')
          .take(1)
          .subscribe((scheduleLists) => {
            // Get taskScheduleList object and assign it to the selectedTaskSchedule
            let taskScheduleList = scheduleLists.find((scheduleList) => scheduleList.id === scheduleListId);
            selectedTaskSchedule['scheduleList'] = taskScheduleList || null;

            // Parse start & end dates to JS Date type
            let [start, end] = [new Date(selectedTaskSchedule.end), new Date(selectedTaskSchedule.end)]
              .map(date => {
                date.setSeconds(0, 0);
                return date;
              });

            this.taskScheduleForm.reset(Object.assign({}, selectedTaskSchedule, {
              start,
              end
            }))
          })

        break;
      case 'DELETE':
        if (this.selectedTaskScheduleId === '') return;

        let taskScheduleToDelete = this.taskSchedules
          .find((taskList) => taskList.id === this.selectedTaskScheduleId)

        this.confirDialogService.confirm({
          message: `¿Esta seguro que desea borrar el calendario de tareas ${taskScheduleToDelete.name}?`,
          header: 'Confirmar borrado calendario de tareas',
          icon: 'fa fa-trash',
          accept: () => {
            this.store.dispatch({
              type: 'DELETE_TASK_SCHEDULE',
              payload: taskScheduleToDelete,
            })
          },
        });

        return;

      case 'NEW':
      default:
        let currentDate = new Date();
        currentDate.setSeconds(0);

        this.taskScheduleForm.reset({
          id: uuidV1(),
          name: '',
          active: true,
          scheduleList: null,
          useDateRange: true,
          start: currentDate,
          end: currentDate,

          second: '*',
          minute: '*',
          hour: '*',
          dayOfMonth: '*',
          month: '*',
          dayOfWeek: '*',
        })
        break;
    }
    this.store.dispatch({
      type: 'SHOW_TASK_SCHEDULE_DIALOG',
      payload: type,
    })
  }

  public saveTaskSchedule() {
    let formValue;
    switch (this.taskScheduleDialogState.type) {
      case 'UPDATE':
        if (this.taskScheduleForm.invalid) {
          return;
        }
        formValue = this.taskScheduleForm.value;
        formValue.scheduleListId = formValue.scheduleList.id;
        delete formValue.scheduleList;

        this.store.dispatch({
          type: 'UPDATE_TASK_SCHEDULE',
          payload: formValue,
        })

        break;

      case 'NEW':
      default:
        if (this.taskScheduleForm.invalid) {
          return;
        }
        formValue = this.taskScheduleForm.value;
        formValue.scheduleListId = formValue.scheduleList.id;
        delete formValue.scheduleList;

        this.store.dispatch({
          type: 'ADD_TASK_SCHEDULE',
          payload: formValue,
        })
        break;
    }
    this.toogleTaskScheduleDialog(false)
  }
  filterLists($event) {
    setTimeout(() => {
      this.store.dispatch({
        type: 'FILTER_SCHEDULE_LIST_BY_NAME',
        payload: $event.query,
      })
      this.taskScheduleListAutocomplete.show()
    });
  }
  handleDropdownClick($event) {
    setTimeout(() => {
      this.store.dispatch({
        type: 'FILTER_SCHEDULE_LIST_NONE',
      })
      this.taskScheduleListAutocomplete.show()
    });
  }
}