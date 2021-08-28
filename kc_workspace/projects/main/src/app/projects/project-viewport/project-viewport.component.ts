import {Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import {ThemePalette} from "@angular/material/core";
import {ProjectModel} from "../../../../../shared/src/models/project.model";
import {ProjectService} from "../../../../../shared/src/services/projects/project.service";
import {Router} from "@angular/router";

@Component({
  selector: 'app-canvas-details',
  templateUrl: './project-viewport.component.html',
  styleUrls: ['./project-viewport.component.scss']
})
export class ProjectViewportComponent implements OnInit {
  @ViewChild("matNavTab", {static: false}) matNavTab: ElementRef = {} as ElementRef;
  project: ProjectModel | null = null;
  activeLinkIndex = 0;
  ksDisabled: boolean = true;
  navLinks = [
    {
      label: 'Overview',
      link: 'app-projects-details-overview',
      index: 0,
      disable: false
    },
    {
      label: 'Knowledge Source',
      link: 'app-ks-edit-list',
      index: 1,
      disabled: true
    }
  ];
  activeLink = this.navLinks[0].index;

  constructor(private projectService: ProjectService, private router: Router) {
    this.projectService.currentProject.subscribe(project => {
      if (project?.name && project?.id.value !== '') {
        this.project = project;
      } else {
        this.project = null;
      }
      this.navLinks[1].disabled = (!project || !project.knowledgeSource || project.knowledgeSource.length === 0);
    });
  }

  ngOnInit(): void {
    this.activeLinkIndex = 0;
    this.router.events.subscribe((res) => {
      let newIndex = this.navLinks.find(tab => tab.link === '.' + this.router.url);
      if (newIndex)
        this.activeLinkIndex = this.navLinks.indexOf(newIndex);
    });
  }

}